import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { priceMonths, type Field } from '../db/schema';
import { CROPS, type Crop } from '../config/crops';
import { DEFAULT_INTEREST_PCT, DEFAULT_STORAGE_COST, THRESHOLDS } from '../config/thresholds';
import { sellOrHold, type MonthPrice, type SellHoldResult } from '../engine/market';
import { harvestTable, type HarvestYearWeek } from '../engine/harvest';
import { priceBacktest } from '../engine/backtest';
import { addDays, monthOf, todayIst, withYear, yearOf } from '../engine/dates';
import { liveReading, type LiveReading } from '../sources/datagov';
import { tracked } from '../sources/status';
import { SOURCE } from '../config/sources';
import { loadMergedWeather } from './weather';

export function assumptions(field: Field) {
  const crop = field.crop as Crop;
  const yieldQ = field.expectedYieldQPerHa ?? CROPS[crop].defaultYieldQPerHa;
  return {
    yieldQPerHa: yieldQ,
    yieldIsDefault: field.expectedYieldQPerHa == null,
    storageCost: field.storageCostPerQMonth ?? DEFAULT_STORAGE_COST,
    interestPct: field.interestPctYear ?? DEFAULT_INTEREST_PCT,
    quantityQ: field.areaHa * yieldQ,
  };
}

export async function loadPrices(commodity: string, mandi: string) {
  const db = await getDb();
  return db.select().from(priceMonths)
    .where(and(eq(priceMonths.commodity, commodity), eq(priceMonths.mandi, mandi)))
    .orderBy(asc(priceMonths.year), asc(priceMonths.month));
}

export interface MarketAnalysis {
  status: 'no_mandi' | 'no_prices' | 'ok';
  commodity: string;
  mandi: string | null;
  source: string | null;
  fetchedAt: string | null;
  decisionMonth: { year: number; month: number; isCurrent: boolean } | null;
  series: { year: number; month: number; price: number }[];
  last12: { label: string; year: number; month: number; price: number | null; pastYears: number[] }[];
  result: SellHoldResult | null;
  assumptions: ReturnType<typeof assumptions>;
  live: (LiveReading & { fetchedAt: string }) | null;
  liveError: string | null;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function marketAnalysis(field: Field, opts: { live?: boolean } = {}): Promise<MarketAnalysis> {
  const crop = field.crop as Crop;
  const commodity = CROPS[crop].commodityName;
  const a = assumptions(field);
  const base: MarketAnalysis = {
    status: 'no_mandi', commodity, mandi: field.mandi, source: null, fetchedAt: null, decisionMonth: null,
    series: [], last12: [], result: null, assumptions: a, live: null, liveError: null,
  };
  if (!field.mandi) return base;
  const rows = await loadPrices(commodity, field.mandi);
  if (rows.length === 0) return { ...base, status: 'no_prices' };

  const prices: MonthPrice[] = rows.map((r) => ({ year: r.year, month: r.month, price: r.modalPriceRsPerQ }));
  const today = todayIst();
  const latest = rows.at(-1)!;
  const isCurrent = latest.year === yearOf(today) && latest.month === monthOf(today);
  const result = sellOrHold(prices, latest.year, latest.month, { quantityQ: a.quantityQ, storageCost: a.storageCost, interestPct: a.interestPct });

  // Last 12 stored months, with the same month in earlier years as markers.
  const map = new Map(prices.map((p) => [p.year * 12 + p.month - 1, p.price]));
  const endKey = latest.year * 12 + latest.month - 1;
  const last12 = Array.from({ length: 12 }, (_, i) => {
    const k = endKey - 11 + i;
    const year = Math.floor(k / 12), month = (k % 12) + 1;
    const pastYears = prices.filter((p) => p.month === month && p.year < year).map((p) => p.price);
    return { label: `${MONTH_LABELS[month - 1]} ${String(year).slice(2)}`, year, month, price: map.get(k) ?? null, pastYears };
  });

  let live: MarketAnalysis['live'] = null;
  let liveError: string | null = null;
  if (opts.live && process.env.DATA_GOV_IN_API_KEY) {
    try {
      const r = await tracked(SOURCE.datagov, () => liveReading(commodity, field.mandi!));
      if (r) live = { ...r, fetchedAt: new Date().toISOString() };
    } catch (e) {
      liveError = e instanceof Error ? e.message : String(e);
    }
  }

  const fetchedAt = rows.reduce((m, r) => (r.fetchedAt > m ? r.fetchedAt : m), rows[0].fetchedAt);
  return {
    ...base, status: 'ok', source: latest.source, fetchedAt: fetchedAt.toISOString(),
    decisionMonth: { year: latest.year, month: latest.month, isCurrent }, series: prices, last12, result, live, liveError,
  };
}

export async function commoditiesWithHistory() {
  const db = await getDb();
  return db.select({
    commodity: priceMonths.commodity,
    mandi: priceMonths.mandi,
    state: sql<string | null>`max(${priceMonths.state})`,
    district: sql<string | null>`max(${priceMonths.district})`,
    years: sql<number>`count(distinct ${priceMonths.year})`,
    firstYear: sql<number>`min(${priceMonths.year})`,
    lastYear: sql<number>`max(${priceMonths.year})`,
    source: sql<string>`max(${priceMonths.source})`,
  }).from(priceMonths).groupBy(priceMonths.commodity, priceMonths.mandi).orderBy(priceMonths.commodity, priceMonths.mandi);
}

/** L12 harvest timing. */
export async function harvestAnalysis(field: Field) {
  const crop = field.crop as Crop;
  const cp = CROPS[crop];
  const wx = await loadMergedWeather(field.id);
  const prices = field.mandi ? await loadPrices(cp.commodityName, field.mandi) : [];
  const priceMap = new Map(prices.map((p) => [`${p.year}-${p.month}`, p.modalPriceRsPerQ]));
  const harvestStart = addDays(field.sowingDate, cp.harvestStartDay);
  const weekStarts = Array.from({ length: 8 }, (_, i) => addDays(harvestStart, 7 * i));
  const rows: HarvestYearWeek[] = [];
  if (wx.lastArchiveDate) {
    for (let y = 2005; y <= yearOf(wx.lastArchiveDate); y++) {
      const offset = y - yearOf(field.sowingDate);
      const starts = weekStarts.map((s) => withYear(s, yearOf(s) + offset));
      if (addDays(starts[7], 6) > wx.lastArchiveDate || starts[0] < '2005-01-01') continue;
      starts.forEach((s, i) => {
        let rainDays = 0;
        for (let k = 0; k < 7; k++) {
          const w = wx.byDate.get(addDays(s, k));
          if (w?.precip != null && w.precip >= THRESHOLDS.rainDayMm) rainDays++;
        }
        const mid = addDays(s, 3);
        rows.push({ year: y, week: i + 1, rainDays, price: priceMap.get(`${yearOf(mid)}-${monthOf(mid)}`) ?? null });
      });
    }
  }
  return {
    harvestStart,
    weekStarts,
    years: new Set(rows.map((r) => r.year)).size,
    hasPrices: prices.length > 0,
    mandi: field.mandi,
    table: harvestTable(rows, weekStarts.map((s) => s.slice(5))),
    weatherSource: { source: 'Open-Meteo archive (ERA5)', fetchedAt: wx.fetched.archive?.toISOString() ?? null },
    priceSource: prices[0]?.source ?? null,
  };
}

/** L15 price backtest. */
export async function priceBacktestFor(field: Field) {
  const crop = field.crop as Crop;
  const a = assumptions(field);
  if (!field.mandi) return { status: 'no_mandi' as const, rows: [] };
  const prices = await loadPrices(CROPS[crop].commodityName, field.mandi);
  if (!prices.length) return { status: 'no_prices' as const, rows: [] };
  const rows = priceBacktest(prices.map((p) => ({ year: p.year, month: p.month, price: p.modalPriceRsPerQ })), CROPS[crop].sellMonth, {
    quantityQ: a.quantityQ, storageCost: a.storageCost, interestPct: a.interestPct,
  });
  const valid = rows.filter((r) => r.diffField != null);
  return {
    status: 'ok' as const,
    rows,
    sellMonth: CROPS[crop].sellMonth,
    totalDiffField: valid.reduce((s, r) => s + (r.diffField ?? 0), 0),
    meanDiffPerQ: valid.length ? valid.reduce((s, r) => s + (r.diffPerQ ?? 0), 0) / valid.length : null,
    source: prices[0].source,
    minYears: THRESHOLDS.minPriceYears,
  };
}
