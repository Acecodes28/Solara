import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { fields, ingestJobs, ndviDays, priceMonths, soilProfiles, weatherDays, type Field } from '../db/schema';
import { SOURCE } from '../config/sources';
import { CROPS, type Crop } from '../config/crops';
import { NDVI_START } from '../config/thresholds';
import { addDays, todayIst, yearOf } from '../engine/dates';
import { awcMmPerM, omFromSoc } from '../engine/soil';
import { fetchArchive, fetchRecentForecast, type DailyRow } from '../sources/openMeteo';
import { fetchSoil } from '../sources/soilgrids';
import { copernicusConfigured, fetchNdvi, pointSquare } from '../sources/copernicus';
import { cedaConfigured, fetchMonthlyPrices } from '../sources/ceda';
import { recordFailure, recordSuccess } from '../sources/status';
import { withTimeout } from '../sources/http';
import { computeField } from './compute';

export type IngestKind = 'history' | 'soil' | 'ndvi' | 'prices';
const KINDS: IngestKind[] = ['history', 'soil', 'ndvi', 'prices'];
const STEP_MS = 120_000;

export class ConflictError extends Error {}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function upsertWeather(fieldId: string, rows: DailyRow[], kindOf: (d: string) => 'archive' | 'recent' | 'forecast', source: string) {
  const db = await getDb();
  const fetchedAt = new Date();
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({
      fieldId, date: r.date, kind: kindOf(r.date), precipMm: r.precip, tmaxC: r.tmax, tminC: r.tmin, et0Mm: r.et0, source, fetchedAt,
    }));
    // A refresh overwrites only rows whose values changed (fetched_at is bumped on change).
    await db.insert(weatherDays).values(chunk).onConflictDoUpdate({
      target: [weatherDays.fieldId, weatherDays.date, weatherDays.kind],
      set: {
        precipMm: sql`excluded.precip_mm`, tmaxC: sql`excluded.tmax_c`, tminC: sql`excluded.tmin_c`, et0Mm: sql`excluded.et0_mm`,
        source: sql`excluded.source`, fetchedAt: sql`excluded.fetched_at`,
      },
      setWhere: sql`(${weatherDays.precipMm}, ${weatherDays.tmaxC}, ${weatherDays.tminC}, ${weatherDays.et0Mm}) IS DISTINCT FROM (excluded.precip_mm, excluded.tmax_c, excluded.tmin_c, excluded.et0_mm)`,
    });
  }
}

async function stepHistory(field: Field): Promise<string> {
  const today = todayIst();
  const msgs: string[] = [];
  let failures = 0;
  try {
    const archive = await fetchArchive(field.centroidLat, field.centroidLon, addDays(today, -7));
    await upsertWeather(field.id, archive, () => 'archive', 'Open-Meteo archive (ERA5)');
    await recordSuccess(SOURCE.archive);
    msgs.push(`${archive.length} archive days`);
  } catch (e) {
    failures++;
    await recordFailure(SOURCE.archive, errMsg(e));
    msgs.push(`archive failed: ${errMsg(e)}`);
  }
  try {
    const recent = await fetchRecentForecast(field.centroidLat, field.centroidLon);
    await upsertWeather(field.id, recent, (d) => (d < today ? 'recent' : 'forecast'), 'Open-Meteo forecast');
    await recordSuccess(SOURCE.forecast);
    msgs.push(`${recent.length} recent and forecast days`);
  } catch (e) {
    failures++;
    await recordFailure(SOURCE.forecast, errMsg(e));
    msgs.push(`forecast failed: ${errMsg(e)}`);
  }
  if (failures === 2) throw new Error(msgs.join('; '));
  return msgs.join('; ');
}

async function stepSoil(field: Field): Promise<string> {
  const db = await getDb();
  try {
    const s = await fetchSoil(field.centroidLat, field.centroidLon);
    const om = omFromSoc(s.socPct);
    const awc = awcMmPerM(s.sandPct / 100, s.clayPct / 100, om);
    const row = { sandPct: s.sandPct, clayPct: s.clayPct, socPct: s.socPct, omPct: om, awcMmPerM: awc, source: 'SoilGrids v2.0', fetchedAt: new Date() };
    await db.insert(soilProfiles).values({ fieldId: field.id, ...row }).onConflictDoUpdate({ target: soilProfiles.fieldId, set: row });
    await recordSuccess(SOURCE.soil);
    return `Sand ${s.sandPct.toFixed(1)}%, clay ${s.clayPct.toFixed(1)}%, available water ${awc.toFixed(1)} mm/m (${s.via})`;
  } catch (e) {
    await recordFailure(SOURCE.soil, errMsg(e));
    throw e;
  }
}

async function stepNdvi(field: Field): Promise<string> {
  if (!copernicusConfigured()) throw new Error('Satellite not configured');
  const db = await getDb();
  const polygon = (field.polygon as GeoJSON.Polygon | null) ?? pointSquare(field.centroidLat, field.centroidLon);
  const today = todayIst();
  const [last] = await db.select({ d: ndviDays.date }).from(ndviDays).where(eq(ndviDays.fieldId, field.id)).orderBy(desc(ndviDays.date)).limit(1);
  const from = last ? addDays(last.d, -30) : NDVI_START;
  let n = 0;
  try {
    for (let y = yearOf(from); y <= yearOf(today); y++) {
      const a = y === yearOf(from) ? from : `${y}-01-01`;
      const b = y === yearOf(today) ? today : `${y}-12-31`;
      const obs = await fetchNdvi(polygon, a, b);
      if (!obs.length) continue;
      const fetchedAt = new Date();
      await db.insert(ndviDays).values(obs.map((o) => ({ fieldId: field.id, date: o.date, ndviMean: o.ndvi, cloudFree: o.cloudFree, source: 'Sentinel-2 L2A via Copernicus Data Space', fetchedAt })))
        .onConflictDoUpdate({ target: [ndviDays.fieldId, ndviDays.date], set: { ndviMean: sql`excluded.ndvi_mean`, cloudFree: sql`excluded.cloud_free`, fetchedAt: sql`excluded.fetched_at` } });
      n += obs.length;
    }
    await recordSuccess(SOURCE.copernicus);
    return `${n} satellite observations`;
  } catch (e) {
    await recordFailure(SOURCE.copernicus, errMsg(e));
    throw e;
  }
}

async function stepPrices(field: Field): Promise<string> {
  const db = await getDb();
  const commodity = CROPS[field.crop as Crop].commodityName;
  if (!field.mandi) {
    const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(priceMonths).where(eq(priceMonths.commodity, commodity));
    return Number(c) > 0 ? 'No mandi chosen yet. Pick one on the Market tab.' : 'No mandi chosen and no stored price history.';
  }
  if (cedaConfigured()) {
    try {
      const months = await fetchMonthlyPrices(commodity, field.mandi);
      const fetchedAt = new Date();
      for (let i = 0; i < months.length; i += 500) {
        await db.insert(priceMonths).values(months.slice(i, i + 500).map((m) => ({
          commodity: m.commodity, mandi: field.mandi!, state: m.state, district: m.district, year: m.year, month: m.month,
          modalPriceRsPerQ: m.modal, minPrice: m.min, maxPrice: m.max, arrivalsTonnes: m.arrivalsTonnes, source: 'CEDA Agri Market Data (API)', fetchedAt,
        }))).onConflictDoUpdate({
          target: [priceMonths.commodity, priceMonths.mandi, priceMonths.year, priceMonths.month],
          set: { modalPriceRsPerQ: sql`excluded.modal_price_rs_per_q`, minPrice: sql`excluded.min_price`, maxPrice: sql`excluded.max_price`, arrivalsTonnes: sql`excluded.arrivals_tonnes`, source: sql`excluded.source`, fetchedAt: sql`excluded.fetched_at` },
        });
      }
      await recordSuccess(SOURCE.ceda);
      return `${months.length} monthly prices from CEDA`;
    } catch (e) {
      await recordFailure(SOURCE.ceda, errMsg(e));
      throw e;
    }
  }
  const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(priceMonths)
    .where(and(eq(priceMonths.commodity, commodity), eq(priceMonths.mandi, field.mandi)));
  if (Number(c) > 0) return `CEDA key not set; using ${c} stored months imported from CEDA CSV`;
  throw new Error('No price key and no imported price file for this mandi');
}

const STEPS: Record<IngestKind, (f: Field) => Promise<string>> = { history: stepHistory, soil: stepSoil, ndvi: stepNdvi, prices: stepPrices };

/** Creates queued jobs; throws ConflictError if a job is already running for this field. */
export async function startIngestion(fieldId: string, kinds: IngestKind[] = KINDS) {
  const db = await getDb();
  // Jobs left running by a server restart are closed after 10 minutes.
  await db.update(ingestJobs).set({ status: 'failed', message: 'Interrupted', finishedAt: new Date() })
    .where(and(eq(ingestJobs.fieldId, fieldId), inArray(ingestJobs.status, ['queued', 'running']), lt(ingestJobs.startedAt, new Date(Date.now() - 10 * 60_000))));
  const active = await db.select().from(ingestJobs).where(and(eq(ingestJobs.fieldId, fieldId), inArray(ingestJobs.status, ['queued', 'running'])));
  if (active.length) throw new ConflictError('Ingestion already running for this field.');
  const now = new Date();
  const jobs = await db.insert(ingestJobs).values(kinds.map((kind) => ({ fieldId, kind, status: 'queued' as const, startedAt: now }))).returning();
  return jobs;
}

export async function runIngestion(fieldId: string, jobs: { id: string; kind: IngestKind }[]) {
  const db = await getDb();
  const [field] = await db.select().from(fields).where(eq(fields.id, fieldId));
  if (!field) return;
  const run = async (job: { id: string; kind: IngestKind }) => {
    await db.update(ingestJobs).set({ status: 'running', startedAt: new Date() }).where(eq(ingestJobs.id, job.id));
    try {
      const message = await withTimeout(STEPS[job.kind](field), STEP_MS, `${job.kind} step`);
      await db.update(ingestJobs).set({ status: 'done', message, finishedAt: new Date() }).where(eq(ingestJobs.id, job.id));
    } catch (e) {
      await db.update(ingestJobs).set({ status: 'failed', message: errMsg(e).slice(0, 300), finishedAt: new Date() }).where(eq(ingestJobs.id, job.id));
    }
  };
  // A failed step does not stop the others.
  await Promise.all(jobs.map(run));
  try {
    await computeField(field, { fetchEnsembles: true });
  } catch (e) {
    console.error('[compute] failed', errMsg(e));
  }
}

export async function latestJobs(fieldId: string) {
  const db = await getDb();
  const rows = await db.select().from(ingestJobs).where(eq(ingestJobs.fieldId, fieldId)).orderBy(desc(ingestJobs.startedAt));
  const out: Partial<Record<IngestKind, (typeof rows)[number]>> = {};
  for (const r of rows) if (!out[r.kind]) out[r.kind] = r;
  return KINDS.map((k) => out[k]).filter(Boolean) as typeof rows;
}
