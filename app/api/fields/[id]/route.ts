import { eq } from 'drizzle-orm';
import { body, browserKey, error, handle, json, loadField, type RouteCtx } from '@/lib/api';
import { FieldPatchSchema } from '@/lib/validation';
import { deleteField, patchField, publicField } from '@/lib/services/fields';
import { latestJobs } from '@/lib/services/ingest';
import { getSummary, computeField } from '@/lib/services/compute';
import { getDb } from '@/lib/db/client';
import { soilProfiles } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async (req: Request, { params }: RouteCtx) => {
  const f = await loadField(params.id);
  const db = await getDb();
  const [soil] = await db.select().from(soilProfiles).where(eq(soilProfiles.fieldId, f.id));
  const jobs = await latestJobs(f.id);
  const s = await getSummary(f.id);
  return json({
    field: publicField(f),
    owned: browserKey(req) === f.browserKey,
    soil: soil ? { ...soil, fieldId: undefined, fetchedAt: soil.fetchedAt.toISOString() } : null,
    ingestion: jobs.map((j) => ({ kind: j.kind, status: j.status, message: j.message, startedAt: j.startedAt?.toISOString() ?? null, finishedAt: j.finishedAt?.toISOString() ?? null })),
    header: s ? { stage: s.stage, dayOfSeason: s.dayOfSeason, seasonLength: s.seasonLength, seasonComplete: s.seasonComplete, gdd: s.gdd, computedAt: s.computedAt, errors: s.errors } : null,
  });
});

export const PATCH = handle(async (req: Request, { params }: RouteCtx) => {
  const f = await loadField(params.id);
  if (browserKey(req) !== f.browserKey) return error('Only the browser that created this field can change it.', 403);
  const input = await body(req, FieldPatchSchema);
  const u = await patchField(f, input);
  // Assumptions and dates change the computed results; recompute (with a fresh ensemble outlook).
  await computeField(u, { fetchEnsembles: true }).catch(() => undefined);
  return json({ field: publicField(u) });
});

export const DELETE = handle(async (req: Request, { params }: RouteCtx) => {
  const f = await loadField(params.id);
  if (browserKey(req) !== f.browserKey) return error('Only the browser that created this field can delete it.', 403);
  await deleteField(f.id);
  return json({ deleted: true });
});
