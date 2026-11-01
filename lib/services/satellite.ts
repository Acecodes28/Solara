import { asc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { ndviDays, type Field } from '../db/schema';
import { seasonLength, type Crop } from '../config/crops';
import { THRESHOLDS } from '../config/thresholds';
import { addDays, diffDays, todayIst, withYear, yearOf } from '../engine/dates';
import { percentile, satelliteVerdict, VERDICT_TEXT } from '../engine/satellite';
import { copernicusConfigured } from '../sources/copernicus';
import type { FieldSummary } from './types';

/** L10. Season NDVI with the past P25-P75 band for the same day of season. */
export async function satelliteAnalysis(field: Field, summary: FieldSummary | null) {
  const db = await getDb();
  const configured = copernicusConfigured();
  const rows = await db.select().from(ndviDays).where(eq(ndviDays.fieldId, field.id)).orderBy(asc(ndviDays.date));
  const crop = field.crop as Crop;
  const L = seasonLength(crop);
  const today = todayIst();
  const sow = field.sowingDate;
  const end = addDays(sow, Math.min(L - 1, Math.max(0, diffDays(today, sow))));
  const clear = rows.filter((r) => r.cloudFree && r.ndviMean != null);
  const byDate = new Map(clear.map((r) => [r.date, r.ndviMean!]));

  const season = clear.filter((r) => r.date >= sow && r.date <= end).map((r) => ({ day: diffDays(r.date, sow), date: r.date, ndvi: r.ndviMean! }));

  // For each day of season, collect the nearest clear value within ±5 days in each past season.
  const pastYears: number[] = [];
  for (let y = 2017; y < yearOf(sow) + 20; y++) if (y !== yearOf(sow)) pastYears.push(y);
  const valuesForDay = (d: number) => {
    const vals: number[] = [];
    for (const y of pastYears) {
      const ps = withYear(sow, y);
      const target = addDays(ps, d);
      if (target > today) continue;
      for (const off of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) {
        const v = byDate.get(addDays(target, off));
        if (v != null) { vals.push(v); break; }
      }
    }
    return vals.sort((a, b) => a - b);
  };
  const band: { day: number; p25: number; p75: number; n: number }[] = [];
  for (let d = 0; d < L; d += 5) {
    const v = valuesForDay(d);
    if (v.length >= 3) band.push({ day: d, p25: percentile(v, 0.25), p75: percentile(v, 0.75), n: v.length });
  }

  const latest = season.at(-1) ?? null;
  const latestAge = latest ? diffDays(today, latest.date) : null;
  const latestBandVals = latest ? valuesForDay(latest.day) : [];
  const latestBand = latestBandVals.length >= 3 ? { p25: percentile(latestBandVals, 0.25), p75: percentile(latestBandVals, 0.75) } : null;
  const verdict = rows.length === 0 ? null : satelliteVerdict({ latestValue: latest?.ndvi ?? null, latestAgeDays: latestAge, band: latestBand, stressProb: summary?.risk.prob ?? null });
  const clear21 = clear.filter((r) => diffDays(today, r.date) <= THRESHOLDS.satelliteRecentDays && r.date <= today).length;
  const fetchedAt = rows.reduce<Date | null>((m, r) => (!m || r.fetchedAt > m ? r.fetchedAt : m), null);

  return {
    configured,
    status: !configured && rows.length === 0 ? 'not_configured' : rows.length === 0 ? 'no_data' : 'ok',
    season,
    band,
    latest,
    latestBand,
    verdict,
    verdictText: verdict ? VERDICT_TEXT[verdict] : null,
    clearImages21: clear21,
    totalObservations: rows.length,
    source: rows[0]?.source ?? 'Sentinel-2 L2A via Copernicus Data Space',
    fetchedAt: fetchedAt?.toISOString() ?? null,
  };
}
