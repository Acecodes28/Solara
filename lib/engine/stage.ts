import { CROPS, type Crop, type Stage, seasonLength } from '../config/crops';

/** L3. Growth stage for day of season d (0-based). Returns null after the season ends. */
export function stageFor(crop: Crop, d: number): Stage | null {
  const [a, b, c, e] = CROPS[crop].stageLengths;
  if (d < 0) return null;
  if (d < a) return 'initial';
  if (d < a + b) return 'development';
  if (d < a + b + c) return 'mid';
  if (d < a + b + c + e) return 'late';
  return null;
}

/** L3. Crop coefficient for day of season d, with linear interpolation in development and late. */
export function kcFor(crop: Crop, d: number): number {
  const p = CROPS[crop];
  const [a, b, c, e] = p.stageLengths;
  if (d < a) return p.kcIni;
  if (d < a + b) return p.kcIni + ((d - a) / b) * (p.kcMid - p.kcIni);
  if (d < a + b + c) return p.kcMid;
  if (d < a + b + c + e) return p.kcMid + ((d - a - b - c) / e) * (p.kcEnd - p.kcMid);
  return p.kcEnd;
}

export function gddDay(tmax: number, tmin: number, base: number): number {
  return Math.max(0, (tmax + tmin) / 2 - base);
}

export function gddTotal(days: { tmax: number | null; tmin: number | null }[], base: number): number {
  return days.reduce((s, d) => (d.tmax == null || d.tmin == null ? s : s + gddDay(d.tmax, d.tmin, base)), 0);
}

export const midStageRange = (crop: Crop): [number, number] => {
  const [a, b, c] = CROPS[crop].stageLengths;
  return [a + b, a + b + c];
};

export { seasonLength };
