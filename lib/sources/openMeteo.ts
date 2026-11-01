import { z } from 'zod';
import { fetchJson } from './http';
import { SOURCE } from '../config/sources';
import { HISTORY_START } from '../config/thresholds';

const num = z.number().nullable();
const DAILY = 'precipitation_sum,temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration';

const DailySchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    precipitation_sum: z.array(num),
    temperature_2m_max: z.array(num),
    temperature_2m_min: z.array(num),
    et0_fao_evapotranspiration: z.array(num),
  }),
});

export interface DailyRow {
  date: string;
  precip: number | null;
  tmax: number | null;
  tmin: number | null;
  et0: number | null;
}

function rows(d: z.infer<typeof DailySchema>['daily']): DailyRow[] {
  return d.time.map((date, i) => ({
    date,
    precip: d.precipitation_sum[i],
    tmax: d.temperature_2m_max[i],
    tmin: d.temperature_2m_min[i],
    et0: d.et0_fao_evapotranspiration[i],
  }));
}

const coord = (lat: number, lon: number) => `latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`;
const forecastBase = () => process.env.OPEN_METEO_BASE_URL || 'https://api.open-meteo.com';

/** ERA5 archive (2005-01-01 to endDate). */
export async function fetchArchive(lat: number, lon: number, endDate: string): Promise<DailyRow[]> {
  const url = `https://archive-api.open-meteo.com/v1/archive?${coord(lat, lon)}&start_date=${HISTORY_START}&end_date=${endDate}&daily=${DAILY}&timezone=Asia%2FKolkata`;
  const j = await fetchJson(url, DailySchema, { source: SOURCE.archive, timeoutMs: 60_000 });
  return rows(j.daily);
}

/** Past 30 days and next 16 days. */
export async function fetchRecentForecast(lat: number, lon: number): Promise<DailyRow[]> {
  const url = `${forecastBase()}/v1/forecast?${coord(lat, lon)}&daily=${DAILY}&past_days=30&forecast_days=16&timezone=Asia%2FKolkata`;
  const j = await fetchJson(url, DailySchema, { source: SOURCE.forecast });
  return rows(j.daily);
}

const MemberDaily = z.object({ daily: z.record(z.string(), z.array(z.union([z.number(), z.string(), z.null()]))) });

export interface EnsembleData {
  dates: string[];
  members: { precip: (number | null)[]; et0: (number | null)[]; tmin: (number | null)[] }[];
  model: string;
}

function members(daily: Record<string, (number | string | null)[]>, vars: string[]) {
  const ids = new Set<string>();
  for (const k of Object.keys(daily)) {
    const m = k.match(/_member(\d+)$/);
    if (m) ids.add(m[1]);
  }
  // The un-suffixed series is the control run and counts as a member.
  const list = ['', ...[...ids].sort()];
  return list.map((id) => Object.fromEntries(vars.map((v) => [v, (daily[id ? `${v}_member${id}` : v] ?? []).map((x) => (typeof x === 'number' ? x : null))])));
}

/** ECMWF IFS 0.25° ensemble, 51 members, 8 days from today. */
export async function fetchEnsemble(lat: number, lon: number): Promise<EnsembleData> {
  const url = `https://ensemble-api.open-meteo.com/v1/ensemble?${coord(lat, lon)}&daily=precipitation_sum,et0_fao_evapotranspiration,temperature_2m_min&models=ecmwf_ifs025&forecast_days=8&timezone=Asia%2FKolkata`;
  const j = await fetchJson(url, MemberDaily, { source: SOURCE.ensemble, timeoutMs: 30_000 });
  const dates = (j.daily.time ?? []).map(String);
  const ms = members(j.daily, ['precipitation_sum', 'et0_fao_evapotranspiration', 'temperature_2m_min']).map((m) => ({
    precip: m.precipitation_sum, et0: m.et0_fao_evapotranspiration, tmin: m.temperature_2m_min,
  }));
  return { dates, members: ms.filter((m) => m.precip.length > 0), model: 'ECMWF IFS 0.25° ensemble' };
}

/** ECMWF SEAS5 seasonal ensemble, 51 members, daily precipitation for 45 days (aggregated to weeks 2-6). */
export async function fetchWeeklyEnsemble(lat: number, lon: number): Promise<{ dates: string[]; members: (number | null)[][] }> {
  const url = `https://seasonal-api.open-meteo.com/v1/seasonal?${coord(lat, lon)}&daily=precipitation_sum&forecast_days=45&timezone=Asia%2FKolkata`;
  const j = await fetchJson(url, MemberDaily, { source: SOURCE.weekly, timeoutMs: 30_000 });
  const dates = (j.daily.time ?? []).map(String);
  const ms = members(j.daily, ['precipitation_sum']).map((m) => m.precipitation_sum).filter((m) => m.length > 0);
  return { dates, members: ms };
}

const GeoSchema = z.object({
  results: z.array(z.object({
    name: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    country_code: z.string().optional(),
    admin1: z.string().optional(),
    admin2: z.string().optional(),
    feature_code: z.string().optional(),
  })).optional(),
});

export interface GeoResult { name: string; lat: number; lon: number; district: string | null; state: string | null }

export async function geocode(q: string, count = 8): Promise<GeoResult[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${count}&language=en&countryCode=IN&format=json`;
  const j = await fetchJson(url, GeoSchema, { source: SOURCE.forecast });
  return (j.results ?? [])
    .filter((r) => !r.country_code || r.country_code === 'IN')
    .map((r) => ({ name: r.name, lat: r.latitude, lon: r.longitude, district: r.admin2?.replace(/ district$/i, '') ?? null, state: r.admin1 ?? null }));
}
