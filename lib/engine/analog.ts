import { THRESHOLDS } from '../config/thresholds';

/** One past season's state on today's day of season, plus its final outcome. */
export interface AnalogSeason {
  year: number;
  depletionRatio: number; // depletion / TAW on the same day of season
  stressDays: number; // mid-stage days with Ks < 1 up to that day
  stressFlag: 0 | 1; // final outcome: critical_stress_days >= 5
  criticalStressDays: number;
}

export interface AnalogState {
  depletionRatio: number;
  stressDays: number;
}

export function analogWeight(cur: AnalogState, s: AnalogState): number {
  const a = (cur.depletionRatio - s.depletionRatio) / THRESHOLDS.analogDepletionScale;
  const b = (cur.stressDays - s.stressDays) / THRESHOLDS.analogStressScale;
  return Math.exp(-(a * a + b * b) / 2);
}

/** L6. Probability = (Σ w·flag + 1) / (Σ w + 2). */
export function analogProbability(cur: AnalogState, seasons: AnalogSeason[]): { prob: number; weights: number[] } {
  let sw = 0, swf = 0;
  const weights = seasons.map((s) => {
    const w = analogWeight(cur, s);
    sw += w;
    swf += w * s.stressFlag;
    return w;
  });
  return { prob: (swf + 1) / (sw + 2), weights };
}

/** Probability from explicit weights and flags (used by the unit test for the formula). */
export function weightedProbability(items: { w: number; flag: 0 | 1 }[]): number {
  const sw = items.reduce((s, i) => s + i.w, 0);
  const swf = items.reduce((s, i) => s + i.w * i.flag, 0);
  return (swf + 1) / (sw + 2);
}

export function brierScore(preds: number[], outcomes: number[]): number {
  if (preds.length === 0 || preds.length !== outcomes.length) return NaN;
  return preds.reduce((s, p, i) => s + (p - outcomes[i]) ** 2, 0) / preds.length;
}

export interface Validation {
  n: number;
  brier: number;
  baseline: number;
  skill: number | null;
  predictions: { year: number; prob: number; flag: 0 | 1 }[];
}

/**
 * Leave-one-season-out validation. `stateOf(season)` gives each held-out season's state on today's day of season.
 */
export function looValidation(seasons: AnalogSeason[]): Validation | null {
  if (seasons.length < 2) return null;
  const predictions = seasons.map((held) => {
    const others = seasons.filter((s) => s.year !== held.year);
    return { year: held.year, prob: analogProbability(held, others).prob, flag: held.stressFlag };
  });
  const flags = predictions.map((p) => p.flag);
  const brier = brierScore(predictions.map((p) => p.prob), flags);
  const share = flags.reduce<number>((s, f) => s + f, 0) / flags.length;
  const baseline = brierScore(flags.map(() => share), flags);
  const skill = baseline > 0 ? 1 - brier / baseline : null;
  return { n: seasons.length, brier, baseline, skill, predictions };
}
