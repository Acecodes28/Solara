/** Date helpers on ISO YYYY-MM-DD strings, computed in UTC so day arithmetic is exact. */

const DAY = 86_400_000;

export const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => fromUtc(toUtc(iso) + n * DAY);
export const diffDays = (a: string, b: string) => Math.round((toUtc(a) - toUtc(b)) / DAY);

/** Today's date in Asia/Kolkata. */
export function todayIst(now = new Date()): string {
  return fromUtc(now.getTime() + 330 * 60_000);
}

export function withYear(iso: string, year: number): string {
  const md = iso.slice(5);
  if (md === '02-29' && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) return `${year}-02-28`;
  return `${year}${iso.slice(4)}`;
}

export const yearOf = (iso: string) => +iso.slice(0, 4);
export const monthOf = (iso: string) => +iso.slice(5, 7);

export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUtc(toUtc(s)) === s;
