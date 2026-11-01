import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { body, browserKey, error, handle, json, loadField, type RouteCtx } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { irrigationLogs } from '@/lib/db/schema';
import { computeField } from '@/lib/services/compute';
import { isIsoDate, todayIst } from '@/lib/engine/dates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LogSchema = z.object({ date: z.string(), amountMm: z.number().gt(0, 'Amount must be above 0 mm.').max(300, 'Amount must be at most 300 mm.') }).strict();

export const GET = handle(async (_req: Request, { params }: RouteCtx) => {
  const f = await loadField(params.id);
  const db = await getDb();
  const rows = await db.select().from(irrigationLogs).where(eq(irrigationLogs.fieldId, f.id)).orderBy(asc(irrigationLogs.date));
  return json({ logs: rows.map((r) => ({ date: r.date, amountMm: r.amountMm })) });
});

/** Logs an irrigation the farmer applied; the balance is recomputed from stored data. */
export const POST = handle(async (req: Request, { params }: RouteCtx) => {
  const f = await loadField(params.id);
  if (browserKey(req) !== f.browserKey) return error('Only the browser that created this field can log irrigation.', 403);
  const input = await body(req, LogSchema);
  if (!isIsoDate(input.date) || input.date < f.sowingDate || input.date > todayIst()) return error('Date must be between the sowing date and today.', 422, { field: 'date' });
  const db = await getDb();
  await db.insert(irrigationLogs).values({ fieldId: f.id, date: input.date, amountMm: input.amountMm })
    .onConflictDoUpdate({ target: [irrigationLogs.fieldId, irrigationLogs.date], set: { amountMm: input.amountMm } });
  await computeField(f, { fetchEnsembles: true });
  return json({ logged: true }, 201);
});

export const DELETE = handle(async (req: Request, { params }: RouteCtx) => {
  const f = await loadField(params.id);
  if (browserKey(req) !== f.browserKey) return error('Only the browser that created this field can change irrigation logs.', 403);
  const date = new URL(req.url).searchParams.get('date') ?? '';
  const db = await getDb();
  await db.delete(irrigationLogs).where(and(eq(irrigationLogs.fieldId, f.id), eq(irrigationLogs.date, date)));
  await computeField(f, { fetchEnsembles: true });
  return json({ deleted: true });
});
