import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { weatherDays } from '../db/schema';

export interface MergedDay {
  date: string;
  precip: number | null;
  tmax: number | null;
  tmin: number | null;
  et0: number | null;
  kind: 'archive' | 'recent' | 'forecast';
  source: string;
  fetchedAt: Date;
}

const complete = (d: { precipMm: number | null; et0Mm: number | null }) => d.precipMm != null && d.et0Mm != null;

/** One row per date: complete archive > recent > forecast > incomplete archive. */
export async function loadMergedWeather(fieldId: string) {
  const db = await getDb();
  const rows = await db.select().from(weatherDays).where(eq(weatherDays.fieldId, fieldId));
  const rank = (r: (typeof rows)[number]) => (r.kind === 'archive' && complete(r) ? 0 : r.kind === 'recent' ? 1 : r.kind === 'forecast' ? 2 : 3);
  const best = new Map<string, (typeof rows)[number]>();
  const fetched: Partial<Record<'archive' | 'recent' | 'forecast', Date>> = {};
  for (const r of rows) {
    const cur = best.get(r.date);
    if (!cur || rank(r) < rank(cur)) best.set(r.date, r);
    if (!fetched[r.kind] || r.fetchedAt > fetched[r.kind]!) fetched[r.kind] = r.fetchedAt;
  }
  const byDate = new Map<string, MergedDay>();
  for (const [date, r] of best) {
    byDate.set(date, { date, precip: r.precipMm, tmax: r.tmaxC, tmin: r.tminC, et0: r.et0Mm, kind: r.kind, source: r.source, fetchedAt: r.fetchedAt });
  }
  const archiveDates = rows.filter((r) => r.kind === 'archive' && complete(r)).map((r) => r.date).sort();
  return { byDate, fetched, lastArchiveDate: archiveDates.at(-1) ?? null, count: rows.length };
}
