import { THRESHOLDS } from '../config/thresholds';

export interface MonthPrice {
  year: number;
  month: number;
  price: number;
}

/** Share of past prices strictly below the current price. */
export function pricePercentile(current: number, past: number[]): number {
  if (past.length === 0) return NaN;
  return past.filter((p) => p < current).length / past.length;
}

/** L11. Gain per quintal for holding h months. r is percent per year. */
export function holdGain(p0: number, ratio: number, h: number, storageCost: number, interestPct: number): number {
  return p0 * (ratio - 1) - h * storageCost - (p0 * (interestPct / 100) * h) / 12;
}

const key = (y: number, m: number) => y * 12 + (m - 1);

export interface HorizonResult {
  h: number;
  expectedGain: number;
  hitRate: number;
  years: number;
}

export interface SellHoldResult {
  status: 'ok' | 'insufficient';
  yearsAvailable: number;
  month: number;
  year: number;
  p0: number | null;
  percentile: number | null;
  horizons: HorizonResult[];
  recommendation: 'hold' | 'sell' | null;
  bestH: number | null;
  bestGainPerQ: number | null;
  bestGainTotal: number | null;
  quantityQ: number;
}

/**
 * L11. prices: monthly modal prices for one mandi and commodity. (year, month) is the decision month,
 * whose price is P0; past years are those before `year`.
 */
export function sellOrHold(prices: MonthPrice[], year: number, month: number, opts: { quantityQ: number; storageCost: number; interestPct: number }): SellHoldResult {
  const map = new Map(prices.map((p) => [key(p.year, p.month), p.price]));
  const p0 = map.get(key(year, month)) ?? null;
  const pastYears = [...new Set(prices.filter((p) => p.year < year && p.month === month).map((p) => p.year))].sort();
  const base: SellHoldResult = {
    status: 'insufficient', yearsAvailable: pastYears.length, month, year, p0, percentile: null, horizons: [],
    recommendation: null, bestH: null, bestGainPerQ: null, bestGainTotal: null, quantityQ: opts.quantityQ,
  };
  if (p0 == null || pastYears.length < THRESHOLDS.minPriceYears) return base;

  const percentile = pricePercentile(p0, pastYears.map((y) => map.get(key(y, month))!));
  const horizons: HorizonResult[] = [1, 2, 3].map((h) => {
    const gains: number[] = [];
    for (const y of pastYears) {
      const now = map.get(key(y, month));
      const later = map.get(key(y, month) + h);
      if (now == null || later == null) continue;
      // Only use outcomes that were known before the decision month.
      if (key(y, month) + h >= key(year, month)) continue;
      gains.push(holdGain(p0, later / now, h, opts.storageCost, opts.interestPct));
    }
    const expectedGain = gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : NaN;
    const hitRate = gains.length ? gains.filter((g) => g > 0).length / gains.length : NaN;
    return { h, expectedGain, hitRate, years: gains.length };
  });

  const qualifying = horizons.filter((r) => r.years >= THRESHOLDS.minPriceYears && r.expectedGain > 0 && r.hitRate >= THRESHOLDS.holdHitRate);
  const best = qualifying.sort((a, b) => b.expectedGain - a.expectedGain)[0]
    ?? [...horizons].filter((r) => Number.isFinite(r.expectedGain)).sort((a, b) => b.expectedGain - a.expectedGain)[0];
  const recommendation = qualifying.length ? 'hold' : 'sell';
  return {
    ...base,
    status: 'ok',
    percentile,
    horizons,
    recommendation,
    bestH: best?.h ?? null,
    bestGainPerQ: best ? best.expectedGain : null,
    bestGainTotal: best ? best.expectedGain * opts.quantityQ : null,
  };
}
