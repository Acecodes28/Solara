import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { balanceDays, fieldResults, fields, irrigationLogs, outlooks, seasonOutcomes, soilProfiles, sourceStatus, type Field } from '../db/schema';
import { CROPS, seasonLength, type Crop } from '../config/crops';
import { SOURCE } from '../config/sources';
import { THRESHOLDS } from '../config/thresholds';
import { addDays, diffDays, todayIst, withYear, yearOf } from '../engine/dates';
import { kcFor, stageFor, gddTotal, midStageRange } from '../engine/stage';
import { runBalance, tawRaw, type BalanceInputDay, type BalanceOutDay } from '../engine/balance';
import { analogProbability, looValidation, type AnalogSeason } from '../engine/analog';
import { sevenDayOutlook, weeklyBelowHalfNormal } from '../engine/outlook';
import { protectiveAlerts } from '../engine/alerts';
import { irrigationDecision } from '../engine/decision';
import { fetchEnsemble, fetchWeeklyEnsemble } from '../sources/openMeteo';
import { recordFailure, recordSuccess } from '../sources/status';
import { loadMergedWeather, type MergedDay } from './weather';
import type { FieldSummary, SimilarSeason } from './types';
import { buildAndStoreAdvice } from './advice';

function seasonInputs(crop: Crop, sowing: string, end: string, byDate: Map<string, MergedDay>, irrigation?: Map<string, number>): BalanceInputDay[] {
  const out: BalanceInputDay[] = [];
  for (let d = 0, date = sowing; date <= end; d++, date = addDays(date, 1)) {
    const w = byDate.get(date);
    out.push({ date, precip: w?.precip ?? null, et0: w?.et0 ?? null, kc: kcFor(crop, d), irrigation: irrigation?.get(date) ?? 0 });
  }
  return out;
}

/** Mid-stage days with Ks < 1 up to and including day index `upTo`. */
function stressDaysUpTo(crop: Crop, bal: BalanceOutDay[], upTo: number): number {
  const [a, b] = midStageRange(crop);
  let n = 0;
  for (let d = a; d < Math.min(b, upTo + 1, bal.length); d++) if (!bal[d].gap && bal[d].ks < 1) n++;
  return n;
}

export interface ComputeOptions {
  /** Fetch the live ensembles (7-day and weeks 2-6). When false, the last stored outlook is reused. */
  fetchEnsembles?: boolean;
}

export async function computeField(field: Field, opts: ComputeOptions = {}): Promise<FieldSummary> {
  const db = await getDb();
  const crop = field.crop as Crop;
  const cp = CROPS[crop];
  const L = seasonLength(crop);
  const today = todayIst();
  const dayOfSeason = diffDays(today, field.sowingDate);
  const seasonComplete = dayOfSeason >= L;
  const lastDay = seasonComplete ? addDays(field.sowingDate, L - 1) : today;
  const dIdx = Math.min(dayOfSeason, L - 1);
  const now = new Date();

  const [soil] = await db.select().from(soilProfiles).where(eq(soilProfiles.fieldId, field.id));
  const wx = await loadMergedWeather(field.id);
  const statuses = await db.select().from(sourceStatus);
  const errors: FieldSummary['errors'] = statuses
    .filter((s) => s.lastErrorAt && (!s.lastSuccessAt || s.lastErrorAt > s.lastSuccessAt))
    .filter((s) => ([SOURCE.archive, SOURCE.forecast, SOURCE.ensemble, SOURCE.weekly, SOURCE.soil] as string[]).includes(s.sourceName))
    .map((s) => ({ source: s.sourceName, message: s.lastError ?? 'failed', lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null }));

  const weatherStamp = {
    source: 'Open-Meteo (ERA5 archive + forecast)',
    fetchedAt: (wx.fetched.recent ?? wx.fetched.archive)?.toISOString() ?? null,
  };

  const summary: FieldSummary = {
    asOf: today,
    computedAt: now.toISOString(),
    dayOfSeason,
    seasonLength: L,
    seasonComplete,
    stage: stageFor(crop, dayOfSeason),
    gdd: null,
    soil: soil ? { sandPct: soil.sandPct, clayPct: soil.clayPct, socPct: soil.socPct, omPct: soil.omPct, awc: soil.awcMmPerM, source: soil.source, fetchedAt: soil.fetchedAt.toISOString() } : null,
    taw: null,
    raw: null,
    today: null,
    gapCount: 0,
    weather: weatherStamp,
    decision: null,
    outlook7: null,
    outlook6: null,
    alerts: [],
    alertsSource: { source: SOURCE.forecast, fetchedAt: wx.fetched.forecast?.toISOString() ?? null },
    risk: { status: 'no_data', prob: null, n: 0, current: null, similar: [], validation: null },
    errors,
  };

  // GDD needs only temperatures.
  if (wx.byDate.size) {
    const temps = [];
    for (let d = field.sowingDate; d <= lastDay; d = addDays(d, 1)) {
      const w = wx.byDate.get(d);
      temps.push({ tmax: w?.tmax ?? null, tmin: w?.tmin ?? null });
    }
    summary.gdd = gddTotal(temps, cp.baseTempC);
  }

  if (!soil || wx.byDate.size === 0) {
    await saveSummary(field.id, summary);
    return summary;
  }

  const { taw, raw } = tawRaw(soil.awcMmPerM, cp.rootDepthM, cp.p);
  summary.taw = taw;
  summary.raw = raw;
  const params = { taw, raw, p: cp.p };

  // L4: current season from sowing to today.
  const logs = await db.select().from(irrigationLogs).where(eq(irrigationLogs.fieldId, field.id));
  const irrigation = new Map(logs.map((l) => [l.date, l.amountMm]));
  const bal = runBalance(seasonInputs(crop, field.sowingDate, lastDay, wx.byDate, irrigation), params);
  summary.gapCount = bal.filter((b) => b.gap).length;
  const last = bal.at(-1)!;
  summary.today = { date: last.date, depletion: last.depletion, ks: last.ks };

  await db.delete(balanceDays).where(eq(balanceDays.fieldId, field.id));
  for (let i = 0; i < bal.length; i += 500) {
    await db.insert(balanceDays).values(bal.slice(i, i + 500).map((b, j) => {
      const d = i + j;
      return {
        fieldId: field.id, date: b.date, stage: stageFor(crop, d) ?? 'late', kc: b.kc, etcMm: b.etc, ks: b.ks,
        depletionMm: b.depletion, rawMm: raw, tawMm: taw, irrigationMm: b.irrigation, precipMm: b.precip, gap: b.gap,
      };
    }));
  }

  // L6: analog seasons from the archive (the analog model is fit per field on 20 years of ERA5).
  const ownYear = yearOf(field.sowingDate);
  const seasons: AnalogSeason[] = [];
  if (wx.lastArchiveDate) {
    for (let y = 2005; y <= yearOf(wx.lastArchiveDate); y++) {
      if (y === ownYear) continue;
      const sow = withYear(field.sowingDate, y);
      const end = addDays(sow, L - 1);
      if (sow < '2005-01-01' || end > wx.lastArchiveDate) continue;
      const pb = runBalance(seasonInputs(crop, sow, end, wx.byDate), params);
      if (pb.filter((b) => b.gap).length > L * 0.1) continue; // too many missing days to trust
      const critical = stressDaysUpTo(crop, pb, L - 1);
      seasons.push({
        year: y,
        depletionRatio: pb[dIdx].depletion / taw,
        stressDays: stressDaysUpTo(crop, pb, dIdx),
        stressFlag: critical >= THRESHOLDS.stressDaysFlag ? 1 : 0,
        criticalStressDays: critical,
      });
    }
  }
  const current = { depletionRatio: last.depletion / taw, stressDays: stressDaysUpTo(crop, bal, dIdx) };
  summary.risk.current = current;
  summary.risk.n = seasons.length;
  const validation = looValidation(seasons);
  const looByYear = new Map(validation?.predictions.map((p) => [p.year, p.prob]) ?? []);
  await db.delete(seasonOutcomes).where(eq(seasonOutcomes.fieldId, field.id));
  if (seasons.length) {
    await db.insert(seasonOutcomes).values(seasons.map((s) => ({
      fieldId: field.id, seasonYear: s.year, criticalStressDays: s.criticalStressDays, stressFlag: s.stressFlag === 1, predictedProb: looByYear.get(s.year) ?? null,
    })));
  }
  if (seasons.length >= THRESHOLDS.minAnalogSeasons) {
    const { prob, weights } = analogProbability(current, seasons);
    summary.risk.status = 'ok';
    summary.risk.prob = prob;
    summary.risk.validation = validation ? { brier: validation.brier, baseline: validation.baseline, skill: validation.skill, n: validation.n } : null;
    summary.risk.similar = seasons
      .map((s, i): SimilarSeason => ({ ...s, weight: weights[i], looProb: looByYear.get(s.year) ?? null }))
      .sort((a, b) => b.weight - a.weight);
  } else {
    summary.risk.status = 'insufficient';
    summary.risk.similar = seasons.map((s) => ({ ...s, weight: 0, looProb: null }));
  }

  // L7 / L8 outlooks.
  let frostShare: (number | null)[] = [];
  if (!seasonComplete) {
    if (opts.fetchEnsembles) {
      await refreshOutlooks(field, crop, dayOfSeason, last.depletion, params, wx.byDate, today).then((r) => { frostShare = r.frostShare; }).catch(() => undefined);
    }
    const stored = await latestOutlook(field.id);
    // A stored 7-day outlook is valid only for the depletion it started from (and for today).
    const start = stored.startDepletion;
    summary.outlook7 = stored.outlook7 && stored.outlook7.asOf === today && start != null && Math.abs(start - last.depletion) <= 0.5 ? stored.outlook7 : null;
    summary.outlook6 = stored.outlook6;
  }

  // L9 alerts from the deterministic forecast for today and the next two days.
  const next3 = [0, 1, 2].map((i) => {
    const date = addDays(today, i);
    const w = wx.byDate.get(date);
    return { date, precip: w?.precip ?? null, tmax: w?.tmax ?? null, tmin: w?.tmin ?? null };
  });
  if (!seasonComplete) summary.alerts = protectiveAlerts(next3, { depletion: last.depletion, raw, stage: summary.stage }, frostShare);

  // L5 decision.
  if (!seasonComplete) summary.decision = irrigationDecision(last.depletion, raw, summary.outlook7?.probByDay ?? []);

  await saveSummary(field.id, summary);
  await buildAndStoreAdvice(field, summary);
  return summary;
}

async function refreshOutlooks(
  field: Field, crop: Crop, dayOfSeason: number, depletion: number,
  params: { taw: number; raw: number; p: number }, byDate: Map<string, MergedDay>, today: string,
) {
  const db = await getDb();
  const lat = field.centroidLat, lon = field.centroidLon;
  let frostShare: (number | null)[] = [];
  const fetchedAt = new Date();
  try {
    const ens = await fetchEnsemble(lat, lon);
    await recordSuccess(SOURCE.ensemble);
    const start = Math.max(0, ens.dates.indexOf(today));
    const kc = Array.from({ length: 7 }, (_, k) => kcFor(crop, dayOfSeason + k + 1));
    const members = ens.members.map((m) => ({ precip: m.precip.slice(start + 1, start + 8), et0: m.et0.slice(start + 1, start + 8) }));
    const r = sevenDayOutlook(depletion, kc, members, params);
    frostShare = [0, 1, 2].map((i) => {
      const vals = ens.members.map((m) => m.tmin[start + i]).filter((v): v is number => v != null);
      return vals.length ? vals.filter((v) => v <= THRESHOLDS.frostTminC).length / vals.length : null;
    });
    await db.delete(outlooks).where(and(eq(outlooks.fieldId, field.id), eq(outlooks.asOfDate, today)));
    await db.insert(outlooks).values(r.probByDay.map((p, i) => ({
      fieldId: field.id, asOfDate: today, dayOffset: i + 1, probIrrigateByDay: p, members: r.members, excluded: r.excluded,
      startDepletionMm: depletion, source: SOURCE.ensemble, fetchedAt,
    })));
  } catch (e) {
    await recordFailure(SOURCE.ensemble, e instanceof Error ? e.message : String(e));
  }

  try {
    const wk = await fetchWeeklyEnsemble(lat, lon);
    await recordSuccess(SOURCE.weekly);
    const start = Math.max(0, wk.dates.indexOf(today));
    const weekTotals = wk.members.map((m) => [2, 3, 4, 5, 6].map((w) => {
      const slice = m.slice(start + 7 * (w - 1) + 1, start + 7 * w + 1);
      return slice.length === 7 && slice.every((v) => v != null) ? slice.reduce<number>((a, b) => a + (b as number), 0) : null;
    }));
    // Normal = mean archive total for the same calendar dates in each past year.
    const lastYear = yearOf(today) - 1;
    const normals = [2, 3, 4, 5, 6].map((w) => {
      const totals: number[] = [];
      for (let y = 2005; y <= lastYear; y++) {
        let s = 0, ok = true;
        for (let k = 7 * (w - 1) + 1; k <= 7 * w; k++) {
          const d = withYear(addDays(today, k), y + (yearOf(addDays(today, k)) - yearOf(today)));
          const v = byDate.get(d);
          if (!v || v.kind !== 'archive' || v.precip == null) { ok = false; break; }
          s += v.precip;
        }
        if (ok) totals.push(s);
      }
      return totals.length >= 10 ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
    });
    const rows = weeklyBelowHalfNormal(weekTotals, normals);
    await db.insert(outlooks).values(rows.map((r) => ({
      fieldId: field.id, asOfDate: today, weeklyOffset: r.week, probRainBelowHalfNormal: r.prob, normalMm: r.normalMm, members: r.members,
      source: SOURCE.weekly, fetchedAt,
    })));
  } catch (e) {
    await recordFailure(SOURCE.weekly, e instanceof Error ? e.message : String(e));
  }
  return { frostShare };
}

export async function latestOutlook(fieldId: string): Promise<Pick<FieldSummary, 'outlook7' | 'outlook6'> & { startDepletion: number | null }> {
  const db = await getDb();
  const rows = await db.select().from(outlooks).where(eq(outlooks.fieldId, fieldId)).orderBy(desc(outlooks.fetchedAt));
  const day = rows.filter((r) => r.dayOffset != null);
  const wk = rows.filter((r) => r.weeklyOffset != null);
  const latest7 = day[0] ? day.filter((r) => r.fetchedAt.getTime() === day[0].fetchedAt.getTime()) : [];
  const latest6 = wk[0] ? wk.filter((r) => r.fetchedAt.getTime() === wk[0].fetchedAt.getTime()) : [];
  return {
    startDepletion: latest7[0]?.startDepletionMm ?? null,
    outlook7: latest7.length ? {
      probByDay: Array.from({ length: 7 }, (_, i) => latest7.find((r) => r.dayOffset === i + 1)?.probIrrigateByDay ?? null),
      members: latest7[0].members ?? 0, excluded: latest7[0].excluded ?? 0, asOf: latest7[0].asOfDate,
      source: latest7[0].source, fetchedAt: latest7[0].fetchedAt.toISOString(),
    } : null,
    outlook6: latest6.length ? {
      rows: [2, 3, 4, 5, 6].map((w) => {
        const r = latest6.find((x) => x.weeklyOffset === w);
        return { week: w, normalMm: r?.normalMm ?? null, prob: r?.probRainBelowHalfNormal ?? null, members: r?.members ?? 0 };
      }),
      asOf: latest6[0].asOfDate, source: latest6[0].source, fetchedAt: latest6[0].fetchedAt.toISOString(),
    } : null,
  };
}

async function saveSummary(fieldId: string, summary: FieldSummary) {
  const db = await getDb();
  const now = new Date();
  await db.insert(fieldResults).values({ fieldId, computedAt: now, summary })
    .onConflictDoUpdate({ target: fieldResults.fieldId, set: { computedAt: now, summary } });
}

export async function getSummary(fieldId: string): Promise<FieldSummary | null> {
  const db = await getDb();
  const [r] = await db.select().from(fieldResults).where(eq(fieldResults.fieldId, fieldId));
  return (r?.summary as FieldSummary) ?? null;
}

/** Returns the stored summary, recomputing it (without network) if it is from an earlier day. */
export async function getFreshSummary(field: Field): Promise<FieldSummary | null> {
  const s = await getSummary(field.id);
  if (s && s.asOf === todayIst()) return s;
  const db = await getDb();
  const [f] = await db.select().from(fields).where(eq(fields.id, field.id));
  if (!f) return null;
  return computeField(f, { fetchEnsembles: false });
}
