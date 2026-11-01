import { THRESHOLDS } from '../config/thresholds';

export type Decision =
  | { kind: 'irrigate_now'; amountMm: number }
  | { kind: 'irrigate_soon'; withinDays: number }
  | { kind: 'no_irrigation' };

/**
 * L5. probByDay[k-1] = probability irrigation is needed by day k (k = 1..7); null entries are skipped.
 */
export function irrigationDecision(depletion: number, raw: number, probByDay: (number | null)[]): Decision {
  if (depletion >= raw) return { kind: 'irrigate_now', amountMm: depletion };
  for (let k = 1; k <= 7; k++) {
    const pr = probByDay[k - 1];
    if (pr != null && pr >= THRESHOLDS.irrigateSoonProb) return { kind: 'irrigate_soon', withinDays: k };
  }
  return { kind: 'no_irrigation' };
}
