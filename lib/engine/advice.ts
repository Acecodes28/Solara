import type { Fact } from './verify';
import type { FieldSummary, AdviceItem } from '../services/types';
import type { SellHoldResult } from './market';
import { THRESHOLDS } from '../config/thresholds';

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (p: number) => r1(p * 100);
const rs = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export interface MarketFacts {
  result: SellHoldResult;
  mandi: string;
  source: string;
  fetchedAt: string | null;
}

/** L13 fact sheet: every value used in advice has an ID, label, value, unit, source and fetch time. */
export function buildFacts(s: FieldSummary, market?: MarketFacts | null): Fact[] {
  const f: Fact[] = [
    { id: 'irrigate_soon_threshold', label: 'Chance at which irrigation is planned', value: THRESHOLDS.irrigateSoonProb * 100, unit: '%', source: 'Solara decision rule (L5)', fetchedAt: null },
    { id: 'frost_irrigate_depletion', label: 'Depletion at which to irrigate before frost', value: THRESHOLDS.frostIrrigateDepletionMm, unit: 'mm', source: 'Solara alert rule (L9)', fetchedAt: null },
  ];
  const w = s.weather;
  if (s.today && s.taw != null && s.raw != null) {
    f.push({ id: 'depletion', label: 'Root-zone depletion today', value: s.today.depletion, unit: 'mm', source: w.source, fetchedAt: w.fetchedAt });
    f.push({ id: 'raw', label: 'Readily available water (RAW)', value: s.raw, unit: 'mm', source: 'Computed from SoilGrids v2.0 and FAO-56', fetchedAt: s.soil?.fetchedAt ?? null });
    f.push({ id: 'taw', label: 'Total available water (TAW)', value: s.taw, unit: 'mm', source: 'Computed from SoilGrids v2.0 and FAO-56', fetchedAt: s.soil?.fetchedAt ?? null });
  }
  if (s.stage) f.push({ id: 'stage', label: 'Growth stage', value: s.stage, unit: 'text', source: 'FAO-56 stage lengths', fetchedAt: s.computedAt });
  f.push({ id: 'day_of_season', label: 'Day of season', value: s.dayOfSeason, unit: 'days', source: 'Sowing date', fetchedAt: s.computedAt });
  if (s.decision?.kind === 'irrigate_soon') f.push({ id: 'irrigate_within', label: 'Irrigate within', value: s.decision.withinDays, unit: 'days', source: s.outlook7?.source ?? '', fetchedAt: s.outlook7?.fetchedAt ?? null });
  if (s.outlook7) {
    s.outlook7.probByDay.forEach((p, i) => {
      if (p != null) f.push({ id: `p_irrigate_d${i + 1}`, label: `Chance irrigation is needed by day ${i + 1}`, value: pct(p), unit: '%', source: s.outlook7!.source, fetchedAt: s.outlook7!.fetchedAt });
    });
  }
  if (s.outlook6) {
    for (const r of s.outlook6.rows) {
      if (r.prob != null) f.push({ id: `p_dry_w${r.week}`, label: `Chance week ${r.week} rain is below half of normal`, value: pct(r.prob), unit: '%', source: s.outlook6.source, fetchedAt: s.outlook6.fetchedAt });
    }
  }
  if (s.risk.status === 'ok' && s.risk.prob != null) {
    f.push({ id: 'stress_prob', label: 'Season water-stress chance', value: pct(s.risk.prob), unit: '%', source: 'Analog model on Open-Meteo ERA5 archive', fetchedAt: s.weather.fetchedAt });
  }
  f.push({ id: 'stress_seasons', label: 'Past seasons used', value: s.risk.n, unit: 'count', source: 'Open-Meteo archive', fetchedAt: s.weather.fetchedAt });
  for (const a of s.alerts) {
    f.push({ id: `${a.type}_threshold`, label: `${a.type} threshold`, value: a.threshold, unit: a.type === 'heavy_rain' ? 'mm' : '°C', source: 'IMD / Solara thresholds', fetchedAt: null });
    f.push({ id: `${a.type}_value`, label: `${a.type} forecast value`, value: a.value, unit: a.unit === 'mm' ? 'mm' : a.unit === '°C' ? '°C' : '%', source: s.alertsSource.source, fetchedAt: s.alertsSource.fetchedAt });
    f.push({ id: `${a.type}_date`, label: `${a.type} date`, value: a.date, unit: 'text', source: s.alertsSource.source, fetchedAt: s.alertsSource.fetchedAt });
  }
  if (s.gdd != null) f.push({ id: 'gdd', label: 'Growing degree days to date', value: r1(s.gdd), unit: 'count', source: w.source, fetchedAt: w.fetchedAt });
  if (market && market.result.status === 'ok') {
    const m = market.result;
    f.push({ id: 'price_p0', label: `Modal price at ${market.mandi}`, value: m.p0, unit: '₹', source: market.source, fetchedAt: market.fetchedAt });
    if (m.percentile != null) f.push({ id: 'price_percentile', label: 'Price percentile vs past years', value: pct(m.percentile), unit: '%', source: market.source, fetchedAt: market.fetchedAt });
    if (m.bestGainPerQ != null) f.push({ id: 'hold_gain_q', label: `Expected gain per quintal for holding ${m.bestH} month(s)`, value: m.bestGainPerQ, unit: '₹', source: market.source, fetchedAt: market.fetchedAt });
    if (m.bestGainTotal != null) f.push({ id: 'hold_gain_total', label: 'Expected gain for the whole field', value: m.bestGainTotal, unit: '₹', source: market.source, fetchedAt: market.fetchedAt });
    const best = m.horizons.find((h) => h.h === m.bestH);
    if (best && Number.isFinite(best.hitRate)) f.push({ id: 'hold_hit_rate', label: 'Hit rate', value: pct(best.hitRate), unit: '%', source: market.source, fetchedAt: market.fetchedAt });
  }
  return f;
}

const factVal = (facts: Fact[], id: string) => facts.find((x) => x.id === id)?.value as number;

/** Fixed templates (used when no language model is configured or its text fails verification). */
export function templateAdvice(s: FieldSummary, facts: Fact[], market?: MarketFacts | null): AdviceItem[] {
  const items: AdviceItem[] = [];
  const d = s.decision;
  if (d && s.today) {
    const dep = r1(s.today.depletion);
    if (d.kind === 'irrigate_now') {
      items.push({
        type: 'irrigate_now',
        title: { en: `Irrigate ${dep} mm now`, hi: `अभी ${dep} mm सिंचाई करें` },
        text: {
          en: `Root-zone water is ${dep} mm below field capacity, past the ${r1(s.raw!)} mm stress point. Irrigate ${dep} mm now to refill the root zone.`,
          hi: `जड़ क्षेत्र में पानी क्षेत्र क्षमता से ${dep} mm कम है, जो ${r1(s.raw!)} mm तनाव सीमा से अधिक है। जड़ क्षेत्र भरने के लिए अभी ${dep} mm सिंचाई करें।`,
        },
        factIds: ['depletion', 'raw'],
      });
    } else if (d.kind === 'irrigate_soon') {
      const p = factVal(facts, `p_irrigate_d${d.withinDays}`);
      items.push({
        type: 'irrigate_soon',
        title: { en: `Irrigate within ${d.withinDays} day${d.withinDays === 1 ? "" : "s"}`, hi: `${d.withinDays} दिन के भीतर सिंचाई करें` },
        text: {
          en: `Depletion is ${dep} mm against a ${r1(s.raw!)} mm stress point. There is a ${p}% chance the root zone reaches the stress point within ${d.withinDays} day${d.withinDays === 1 ? "" : "s"}. Plan irrigation.`,
          hi: `कमी ${dep} mm है, तनाव सीमा ${r1(s.raw!)} mm है। ${d.withinDays} दिन में तनाव सीमा तक पहुँचने की संभावना ${p}% है। सिंचाई की योजना बनाएँ।`,
        },
        factIds: ['depletion', 'raw', `p_irrigate_d${d.withinDays}`, 'irrigate_within'],
      });
    } else {
      items.push({
        type: 'no_irrigation',
        title: { en: 'No irrigation needed for 7 days', hi: '7 दिन तक सिंचाई की ज़रूरत नहीं' },
        text: {
          en: `Depletion is ${dep} mm, below the ${r1(s.raw!)} mm stress point, and no day in the next week reaches a 60% chance of needing water.`,
          hi: `कमी ${dep} mm है, जो ${r1(s.raw!)} mm तनाव सीमा से कम है, और अगले सप्ताह किसी दिन पानी की ज़रूरत की संभावना 60% तक नहीं पहुँचती।`,
        },
        factIds: ['depletion', 'raw'],
      });
    }
  }
  for (const a of s.alerts) {
    if (a.type === 'frost') {
      items.push({
        type: 'frost',
        title: { en: `Frost risk on ${a.date}`, hi: `${a.date} को पाले का खतरा` },
        text: {
          en: a.unit === '°C'
            ? `A frost night at or below ${a.threshold} °C is forecast for ${a.date} (forecast minimum ${r1(a.value)} °C). ${a.action}`
            : `${r1(a.value)}% of ensemble members show a minimum at or below ${a.threshold} °C on ${a.date}. ${a.action}`,
          hi: a.unit === '°C'
            ? `${a.date} को ${a.threshold} °C या उससे कम की पाले वाली रात का पूर्वानुमान है (न्यूनतम ${r1(a.value)} °C)। ${a.actionHi}`
            : `${a.date} को ${r1(a.value)}% एन्सेम्बल सदस्य न्यूनतम तापमान ${a.threshold} °C या कम दिखाते हैं। ${a.actionHi}`,
        },
        factIds: ['frost_threshold', 'frost_value', 'frost_date', 'depletion'],
      });
    } else if (a.type === 'heavy_rain') {
      items.push({
        type: 'heavy_rain',
        title: { en: `Heavy rain on ${a.date}`, hi: `${a.date} को भारी बारिश` },
        text: {
          en: `${r1(a.value)} mm of rain is forecast for ${a.date}, above the ${a.threshold} mm heavy-rain mark. ${a.action}`,
          hi: `${a.date} को ${r1(a.value)} mm बारिश का पूर्वानुमान है, जो ${a.threshold} mm भारी बारिश सीमा से अधिक है। ${a.actionHi}`,
        },
        factIds: ['heavy_rain_threshold', 'heavy_rain_value', 'heavy_rain_date'],
      });
    } else {
      items.push({
        type: 'heatwave',
        title: { en: `Heat on ${a.date}`, hi: `${a.date} को लू` },
        text: {
          en: `A maximum of ${r1(a.value)} °C is forecast for ${a.date}, at or above the ${a.threshold} °C heatwave mark. ${a.action}`,
          hi: `${a.date} को अधिकतम ${r1(a.value)} °C का पूर्वानुमान है, जो ${a.threshold} °C लू सीमा पर या उससे ऊपर है। ${a.actionHi}`,
        },
        factIds: ['heatwave_threshold', 'heatwave_value', 'heatwave_date', 'depletion', 'raw'],
      });
    }
  }
  if (s.risk.status === 'ok' && s.risk.prob != null && s.risk.prob >= 0.5) {
    const p = pct(s.risk.prob);
    items.push({
      type: 'monitor',
      title: { en: 'High season stress chance', hi: 'मौसम में तनाव की अधिक संभावना' },
      text: {
        en: `Similar past seasons put the chance of a water-stress period in the critical stage at ${p}% (from ${s.risk.n} past seasons). Keep a close watch on soil moisture during flowering and grain fill.`,
        hi: `मिलते-जुलते पिछले मौसमों के आधार पर महत्वपूर्ण चरण में पानी के तनाव की संभावना ${p}% है (${s.risk.n} पिछले मौसमों से)। फूल और दाना भरने के समय नमी पर नज़र रखें।`,
      },
      factIds: ['stress_prob', 'stress_seasons'],
    });
  }
  if (market && market.result.status === 'ok' && market.result.recommendation) {
    const m = market.result;
    const p0 = rs(m.p0!);
    if (m.recommendation === 'hold') {
      items.push({
        type: 'hold',
        title: { en: `Holding ${m.bestH} month(s) has paid in past years`, hi: `पिछले वर्षों में ${m.bestH} महीने रोकना फ़ायदेमंद रहा` },
        text: {
          en: `At ${market.mandi} the modal price is ${p0} per quintal. In past years, holding ${m.bestH} month(s) gained ${rs(m.bestGainPerQ!)} per quintal on average after storage and interest, about ${rs(m.bestGainTotal!)} for this field.`,
          hi: `${market.mandi} में मॉडल भाव ${p0} प्रति क्विंटल है। पिछले वर्षों में ${m.bestH} महीने रोकने पर भंडारण और ब्याज के बाद औसतन ${rs(m.bestGainPerQ!)} प्रति क्विंटल लाभ हुआ, इस खेत के लिए लगभग ${rs(m.bestGainTotal!)}।`,
        },
        factIds: ['price_p0', 'hold_gain_q', 'hold_gain_total', 'hold_hit_rate'],
      });
    } else {
      items.push({
        type: 'sell',
        title: { en: 'Selling now has matched holding in past years', hi: 'पिछले वर्षों में अभी बेचना रोकने जितना ही रहा' },
        text: {
          en: `At ${market.mandi} the modal price is ${p0} per quintal. No holding period of 1 to 3 months gained reliably in past years after storage and interest.`,
          hi: `${market.mandi} में मॉडल भाव ${p0} प्रति क्विंटल है। पिछले वर्षों में भंडारण और ब्याज के बाद 1 से 3 महीने रोकने पर भरोसेमंद लाभ नहीं हुआ।`,
        },
        factIds: ['price_p0'],
      });
    }
  }
  return items;
}
