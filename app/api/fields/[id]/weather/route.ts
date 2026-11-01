import { and, asc, eq, gte } from 'drizzle-orm';
import { handle, json, loadField, type RouteCtx } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { weatherDays } from '@/lib/db/schema';
import { addDays, todayIst } from '@/lib/engine/dates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Daily weather with source flags. ?from=YYYY-MM-DD (default: 60 days ago). */
export const GET = handle(async (req: Request, { params }: RouteCtx) => {
  const f = await loadField(params.id);
  const qFrom = new URL(req.url).searchParams.get('from');
  const from = qFrom && /^\d{4}-\d{2}-\d{2}$/.test(qFrom) ? qFrom : addDays(todayIst(), -60);
  const db = await getDb();
  const rows = await db.select().from(weatherDays).where(and(eq(weatherDays.fieldId, f.id), gte(weatherDays.date, from))).orderBy(asc(weatherDays.date), asc(weatherDays.kind));
  return json({
    days: rows.map((r) => ({ date: r.date, kind: r.kind, precip_mm: r.precipMm, tmax_c: r.tmaxC, tmin_c: r.tminC, et0_mm: r.et0Mm, source: r.source, fetched_at: r.fetchedAt.toISOString() })),
    attribution: 'Weather data by Open-Meteo.com. ERA5: Copernicus Climate Change Service (C3S).',
  });
});
