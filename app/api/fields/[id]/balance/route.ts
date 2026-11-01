import { asc, eq } from 'drizzle-orm';
import { handle, json, loadField, type RouteCtx } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { balanceDays } from '@/lib/db/schema';
import { getFreshSummary } from '@/lib/services/compute';
import { CROPS, type Crop } from '@/lib/config/crops';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async (_req: Request, { params }: RouteCtx) => {
  const f = await loadField(params.id);
  const s = await getFreshSummary(f);
  const db = await getDb();
  const rows = await db.select().from(balanceDays).where(eq(balanceDays.fieldId, f.id)).orderBy(asc(balanceDays.date));
  const [a, b, c] = CROPS[f.crop as Crop].stageLengths;
  return json({
    days: rows.map((r) => ({ date: r.date, stage: r.stage, kc: r.kc, etc_mm: r.etcMm, ks: r.ks, depletion_mm: r.depletionMm, raw_mm: r.rawMm, taw_mm: r.tawMm, irrigation_mm: r.irrigationMm, precip_mm: r.precipMm, gap: r.gap })),
    taw: s?.taw ?? null,
    raw: s?.raw ?? null,
    gapCount: s?.gapCount ?? 0,
    stageStarts: { development: a, mid: a + b, late: a + b + c },
    soil: s?.soil ?? null,
    weather: s?.weather ?? null,
    errors: s?.errors ?? [],
  });
});
