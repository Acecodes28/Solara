import { sellOrHold, type MonthPrice } from './market';

export interface PriceBacktestRow {
  year: number;
  recommendation: 'hold' | 'sell' | null;
  h: number | null;
  harvestPrice: number;
  realisedPrice: number | null;
  diffPerQ: number | null;
  diffField: number | null;
}

/**
 * L15. For each past year, the advice as it would have been on the first day of that year's sell window
 * (using only earlier years), compared with selling in the harvest month.
 */
export function priceBacktest(prices: MonthPrice[], sellMonth: number, opts: { quantityQ: number; storageCost: number; interestPct: number }): PriceBacktestRow[] {
  const byKey = new Map(prices.map((p) => [p.year * 12 + p.month - 1, p.price]));
  const years = [...new Set(prices.filter((p) => p.month === sellMonth).map((p) => p.year))].sort();
  const rows: PriceBacktestRow[] = [];
  for (const y of years) {
    const harvestPrice = byKey.get(y * 12 + sellMonth - 1)!;
    const known = prices.filter((p) => p.year * 12 + p.month - 1 <= y * 12 + sellMonth - 1);
    const r = sellOrHold(known, y, sellMonth, opts);
    if (r.status !== 'ok') continue;
    if (r.recommendation === 'sell') {
      rows.push({ year: y, recommendation: 'sell', h: null, harvestPrice, realisedPrice: harvestPrice, diffPerQ: 0, diffField: 0 });
      continue;
    }
    const h = r.bestH!;
    const later = byKey.get(y * 12 + sellMonth - 1 + h);
    if (later == null) {
      rows.push({ year: y, recommendation: 'hold', h, harvestPrice, realisedPrice: null, diffPerQ: null, diffField: null });
      continue;
    }
    const costs = h * opts.storageCost + (harvestPrice * (opts.interestPct / 100) * h) / 12;
    const diffPerQ = later - harvestPrice - costs;
    rows.push({ year: y, recommendation: 'hold', h, harvestPrice, realisedPrice: later, diffPerQ, diffField: diffPerQ * opts.quantityQ });
  }
  return rows;
}
