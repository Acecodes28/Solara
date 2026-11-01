import { THRESHOLDS } from '../config/thresholds';

export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export type SatelliteVerdictCode = 'agrees_below' | 'no_stress_yet' | 'unexplained_stress' | 'agree_no_stress' | 'no_clear_image' | 'no_band';

export const VERDICT_TEXT: Record<SatelliteVerdictCode, { en: string; hi: string }> = {
  agrees_below: { en: 'Satellite agrees: vegetation is below normal', hi: 'उपग्रह सहमत है: वनस्पति सामान्य से कम है' },
  no_stress_yet: { en: 'Satellite does not yet show stress', hi: 'उपग्रह में अभी तनाव नहीं दिखता' },
  unexplained_stress: { en: 'Satellite shows stress that the weather model does not explain; check the field', hi: 'उपग्रह ऐसा तनाव दिखा रहा है जिसे मौसम मॉडल नहीं समझाता; खेत जाँचें' },
  agree_no_stress: { en: 'Satellite and weather agree: no stress', hi: 'उपग्रह और मौसम सहमत हैं: कोई तनाव नहीं' },
  no_clear_image: { en: 'No clear satellite image in the last 21 days', hi: 'पिछले 21 दिनों में कोई साफ़ उपग्रह चित्र नहीं' },
  no_band: { en: 'Not enough past satellite seasons to form a normal band', hi: 'सामान्य दायरा बनाने के लिए पर्याप्त पिछले मौसम नहीं' },
};

/** L10. */
export function satelliteVerdict(args: {
  latestValue: number | null;
  latestAgeDays: number | null;
  band: { p25: number; p75: number } | null;
  stressProb: number | null;
}): SatelliteVerdictCode {
  const { latestValue, latestAgeDays, band, stressProb } = args;
  if (latestValue == null || latestAgeDays == null || latestAgeDays > THRESHOLDS.satelliteRecentDays) return 'no_clear_image';
  if (!band) return 'no_band';
  const below = latestValue < band.p25;
  const high = stressProb != null && stressProb >= 0.5;
  if (high && below) return 'agrees_below';
  if (high) return 'no_stress_yet';
  if (below) return 'unexplained_stress';
  return 'agree_no_stress';
}
