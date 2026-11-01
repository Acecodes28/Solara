import { THRESHOLDS } from '../config/thresholds';

/** L12. Modelled loss from rain days in a harvest week (assumption: 3% per rain day, capped at 30%). */
export function harvestLoss(rainDays: number): number {
  return Math.min(THRESHOLDS.harvestLossCap, THRESHOLDS.harvestLossPerRainDay * rainDays);
}

export const netValue = (price: number, rainDays: number) => price * (1 - harvestLoss(rainDays));

export interface HarvestYearWeek {
  year: number;
  week: number; // 1..8
  rainDays: number;
  price: number | null;
}

export interface HarvestWeekRow {
  week: number;
  startMonthDay: string;
  avgRainDays: number;
  avgNetValue: number | null;
  shareBest: number | null;
  years: number;
  priceYears: number;
}

export function harvestTable(rows: HarvestYearWeek[], weekStarts: string[]): HarvestWeekRow[] {
  const years = [...new Set(rows.map((r) => r.year))];
  const bestCount = Array(8).fill(0);
  let yearsWithPrices = 0;
  for (const y of years) {
    const yr = rows.filter((r) => r.year === y && r.price != null);
    if (yr.length !== 8) continue;
    yearsWithPrices++;
    const best = yr.reduce((a, b) => (netValue(b.price!, b.rainDays) > netValue(a.price!, a.rainDays) ? b : a));
    bestCount[best.week - 1]++;
  }
  return Array.from({ length: 8 }, (_, i) => {
    const wk = rows.filter((r) => r.week === i + 1);
    const priced = wk.filter((r) => r.price != null);
    return {
      week: i + 1,
      startMonthDay: weekStarts[i],
      avgRainDays: wk.length ? wk.reduce((s, r) => s + r.rainDays, 0) / wk.length : 0,
      avgNetValue: priced.length ? priced.reduce((s, r) => s + netValue(r.price!, r.rainDays), 0) / priced.length : null,
      shareBest: yearsWithPrices ? bestCount[i] / yearsWithPrices : null,
      years: wk.length,
      priceYears: priced.length,
    };
  });
}
