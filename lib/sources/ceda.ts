import { z } from 'zod';
import { fetchJson, SourceError } from './http';
import { SOURCE } from '../config/sources';

/**
 * CEDA Agri Market Data API (api.ceda.ashoka.edu.in), Bearer-token auth.
 * Endpoints: GET /v1/agmarknet/commodities, GET /v1/agmarknet/geographies,
 * POST /v1/agmarknet/markets, POST /v1/agmarknet/prices.
 * Field names are matched by pattern because the public documentation is behind registration;
 * any mismatch is reported as a failure and the CSV import remains available.
 */
const BASE = 'https://api.ceda.ashoka.edu.in/v1/agmarknet';

export const cedaConfigured = () => !!process.env.CEDA_API_KEY;

type Row = Record<string, unknown>;
const Envelope = z.unknown();

function rowsOf(j: unknown): Row[] {
  if (Array.isArray(j)) return j as Row[];
  if (j && typeof j === 'object') {
    const o = j as Record<string, unknown>;
    if (o.status === 'failure') throw new SourceError(SOURCE.ceda, String(o.message ?? 'Request failed'));
    for (const k of ['data', 'output', 'result', 'results', 'rows']) {
      const v = o[k];
      if (Array.isArray(v)) return v as Row[];
      if (v && typeof v === 'object') {
        const inner = rowsOf(v);
        if (inner.length) return inner;
      }
    }
  }
  return [];
}

const pick = (r: Row, re: RegExp) => {
  const k = Object.keys(r).find((x) => re.test(x));
  return k ? r[k] : undefined;
};

async function call(path: string, body?: unknown): Promise<Row[]> {
  const j = await fetchJson(`${BASE}/${path}`, Envelope, {
    source: SOURCE.ceda,
    method: body ? 'POST' : 'GET',
    body,
    timeoutMs: 30_000,
    retry: !body,
    headers: { Authorization: `Bearer ${process.env.CEDA_API_KEY}` },
  });
  return rowsOf(j);
}

function findByName(rows: Row[], name: string): Row | undefined {
  const n = name.trim().toLowerCase();
  return rows.find((r) => Object.values(r).some((v) => typeof v === 'string' && v.trim().toLowerCase() === n))
    ?? rows.find((r) => Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().startsWith(n)));
}

const idOf = (r: Row, prefix: string) => pick(r, new RegExp(`^${prefix}_?id$`, 'i')) ?? pick(r, /^id$/i);

export interface CedaMonth {
  commodity: string;
  mandi: string;
  state: string | null;
  district: string | null;
  year: number;
  month: number;
  modal: number;
  min: number | null;
  max: number | null;
  arrivalsTonnes: number | null;
}

/** Monthly prices since 2000 for one commodity at one mandi in a state. */
export async function fetchMonthlyPrices(commodity: string, mandi: string, state = 'Madhya Pradesh'): Promise<CedaMonth[]> {
  const commodities = await call('commodities');
  const c = findByName(commodities, commodity);
  if (!c) throw new SourceError(SOURCE.ceda, `Commodity ${commodity} not found`);
  const geos = await call('geographies');
  const st = findByName(geos, state);
  const commodityId = idOf(c, 'commodity');
  const stateId = st ? idOf(st, 'state') ?? pick(st, /state.*id/i) : undefined;
  const markets = await call('markets', { commodity_id: commodityId, state_id: stateId });
  const mk = findByName(markets, mandi);
  if (!mk) throw new SourceError(SOURCE.ceda, `Mandi ${mandi} not found for ${commodity}`);
  const today = new Date().toISOString().slice(0, 10);
  const rows = await call('prices', {
    commodity_id: commodityId,
    state_id: stateId ?? pick(mk, /state.*id/i),
    district_id: pick(mk, /district.*id/i),
    market_id: idOf(mk, 'market'),
    from_date: '2000-01-01',
    to_date: today,
  });
  return aggregateMonthly(rows.map((r) => normaliseRow(r, commodity, mandi)).filter((x): x is NormRow => x != null));
}

export interface NormRow {
  commodity: string;
  mandi: string;
  state: string | null;
  district: string | null;
  date: string; // YYYY-MM-DD or YYYY-MM-01
  modal: number;
  min: number | null;
  max: number | null;
  arrivals: number | null;
}

const toNum = (v: unknown) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseDateish(v: unknown, yearHint?: unknown, monthHint?: unknown): string | null {
  if (yearHint != null && monthHint != null) {
    const y = toNum(yearHint);
    let m = toNum(monthHint);
    if (m == null) {
      const idx = MONTHS.indexOf(String(monthHint).trim().slice(0, 3).toLowerCase());
      m = idx >= 0 ? idx + 1 : null;
    }
    if (y && m) return `${y}-${String(m).padStart(2, '0')}-01`;
  }
  if (v == null) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3] ?? '01'}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^([A-Za-z]{3})[a-z]*[\s-]+(\d{4})$/);
  if (m) {
    const idx = MONTHS.indexOf(m[1].toLowerCase());
    if (idx >= 0) return `${m[2]}-${String(idx + 1).padStart(2, '0')}-01`;
  }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-](\d{4})$/);
  if (m) {
    const idx = MONTHS.indexOf(m[2].toLowerCase());
    if (idx >= 0) return `${m[3]}-${String(idx + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

/** Maps a raw record (API or CSV) to a normalised price row. Prices are Rs per quintal; arrivals in tonnes. */
export function normaliseRow(r: Row, commodityDefault?: string, mandiDefault?: string): NormRow | null {
  const modal = toNum(pick(r, /modal/i));
  if (modal == null || modal <= 0) return null;
  const date = parseDateish(pick(r, /^(date|arrival_?date|price_?date|month_?year|period|t)$/i) ?? pick(r, /date/i), pick(r, /^year$/i), pick(r, /^month$/i));
  if (!date) return null;
  const commodity = String(pick(r, /^commodity(_name)?$/i) ?? commodityDefault ?? '').trim();
  const mandi = String(pick(r, /^(market|mandi|apmc)(_?name)?$/i) ?? mandiDefault ?? '').trim();
  if (!commodity || !mandi) return null;
  const arrivalsRaw = toNum(pick(r, /arrival|quantity/i));
  return {
    commodity,
    mandi,
    state: (pick(r, /^state(_name)?$/i) as string | undefined)?.toString().trim() ?? null,
    district: (pick(r, /^district(_name)?$/i) as string | undefined)?.toString().trim() ?? null,
    date,
    modal,
    min: toNum(pick(r, /^min/i)),
    max: toNum(pick(r, /^max/i)),
    arrivals: arrivalsRaw,
  };
}

/** Daily or monthly rows → one row per month: median modal price, min of mins, max of maxes, summed arrivals. */
export function aggregateMonthly(rows: NormRow[]): CedaMonth[] {
  const groups = new Map<string, NormRow[]>();
  for (const r of rows) {
    const k = `${r.commodity}|${r.mandi}|${r.date.slice(0, 7)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  return [...groups.values()].map((g) => {
    const modals = g.map((x) => x.modal).sort((a, b) => a - b);
    const mid = Math.floor(modals.length / 2);
    const median = modals.length % 2 ? modals[mid] : (modals[mid - 1] + modals[mid]) / 2;
    const mins = g.map((x) => x.min).filter((x): x is number => x != null);
    const maxs = g.map((x) => x.max).filter((x): x is number => x != null);
    const arr = g.map((x) => x.arrivals).filter((x): x is number => x != null);
    return {
      commodity: normaliseCommodity(g[0].commodity),
      mandi: g[0].mandi,
      state: g[0].state,
      district: g[0].district,
      year: +g[0].date.slice(0, 4),
      month: +g[0].date.slice(5, 7),
      modal: median,
      min: mins.length ? Math.min(...mins) : null,
      max: maxs.length ? Math.max(...maxs) : null,
      arrivalsTonnes: arr.length ? arr.reduce((a, b) => a + b, 0) : null,
    };
  });
}

export function normaliseCommodity(c: string): string {
  const s = c.toLowerCase();
  if (s.startsWith('wheat')) return 'Wheat';
  if (s.startsWith('soya') || s.startsWith('soybean')) return 'Soybean';
  return c.trim();
}
