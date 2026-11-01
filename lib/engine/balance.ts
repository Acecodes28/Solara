/** L4. Daily root-zone water balance (FAO-56 single crop coefficient). */

export interface BalanceParams {
  taw: number;
  raw: number;
  p: number;
}

export interface BalanceInputDay {
  date: string;
  precip: number | null;
  et0: number | null;
  kc: number;
  irrigation?: number;
}

export interface BalanceOutDay {
  date: string;
  kc: number;
  etc: number | null;
  ks: number;
  depletion: number;
  precip: number | null;
  irrigation: number;
  gap: boolean;
}

export function ksFor(prevDepletion: number, { taw, raw, p }: BalanceParams): number {
  if (prevDepletion <= raw) return 1;
  return Math.max(0, (taw - prevDepletion) / ((1 - p) * taw));
}

export function step(prevDepletion: number, day: BalanceInputDay, params: BalanceParams): BalanceOutDay {
  const irrigation = day.irrigation ?? 0;
  if (day.precip == null || day.et0 == null) {
    return { date: day.date, kc: day.kc, etc: null, ks: ksFor(prevDepletion, params), depletion: prevDepletion, precip: day.precip, irrigation, gap: true };
  }
  const ks = ksFor(prevDepletion, params);
  const etc = day.kc * day.et0;
  const raw = prevDepletion - day.precip - irrigation + ks * etc;
  const depletion = Math.min(params.taw, Math.max(0, raw));
  return { date: day.date, kc: day.kc, etc, ks, depletion, precip: day.precip, irrigation, gap: false };
}

/** Runs the balance from an initial depletion (day 0 = 0 by default). */
export function runBalance(days: BalanceInputDay[], params: BalanceParams, initial = 0): BalanceOutDay[] {
  const out: BalanceOutDay[] = [];
  let dep = initial;
  for (const d of days) {
    const r = step(dep, d, params);
    out.push(r);
    dep = r.depletion;
  }
  return out;
}

export function tawRaw(awcMmPerM: number, rootDepthM: number, p: number) {
  const taw = awcMmPerM * rootDepthM;
  return { taw, raw: p * taw };
}
