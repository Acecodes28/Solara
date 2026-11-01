/**
 * L2. Plant-available water from texture and organic matter (Saxton & Rawls 2006).
 * sand and clay are fractions (0-1); omPct is organic matter in percent.
 */
export function awcMmPerM(sand: number, clay: number, omPct: number): number {
  const S = sand, C = clay, OM = omPct;
  const t1500 = -0.024 * S + 0.487 * C + 0.006 * OM + 0.005 * S * OM - 0.013 * C * OM + 0.068 * S * C + 0.031;
  const th1500 = t1500 + (0.14 * t1500 - 0.02);
  const t33 = -0.251 * S + 0.195 * C + 0.011 * OM + 0.006 * S * OM - 0.027 * C * OM + 0.452 * S * C + 0.299;
  const th33 = t33 + (1.283 * t33 * t33 - 0.374 * t33 - 0.015);
  const awc = (th33 - th1500) * 1000;
  return Math.min(250, Math.max(40, awc));
}

export const omFromSoc = (socPct: number) => socPct * 1.724;
