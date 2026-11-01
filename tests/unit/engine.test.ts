import { describe, expect, it } from 'vitest';
import { awcMmPerM } from '@/lib/engine/soil';
import { runBalance } from '@/lib/engine/balance';
import { irrigationDecision } from '@/lib/engine/decision';
import { stageFor, kcFor, gddDay } from '@/lib/engine/stage';
import { brierScore, weightedProbability, analogProbability } from '@/lib/engine/analog';
import { pricePercentile, holdGain, sellOrHold } from '@/lib/engine/market';
import { harvestLoss } from '@/lib/engine/harvest';
import { verifyText, type Fact } from '@/lib/engine/verify';
import { isStale, sourceState } from '@/lib/engine/staleness';
import { protectiveAlerts, isHeavyRain } from '@/lib/engine/alerts';
import { sevenDayOutlook, weeklyBelowHalfNormal } from '@/lib/engine/outlook';
import { satelliteVerdict } from '@/lib/engine/satellite';
import { checkGeometry, MSG } from '@/lib/validation';

describe('soil (L2)', () => {
  it('AC7: sand 0.40, clay 0.20, OM 1.5% gives 137.8 mm/m', () => {
    expect(Math.round(awcMmPerM(0.4, 0.2, 1.5) * 10) / 10).toBe(137.8);
  });
  it('clamps to 40..250', () => {
    expect(awcMmPerM(0.95, 0.02, 0)).toBeGreaterThanOrEqual(40);
    expect(awcMmPerM(0.95, 0.02, 0)).toBeLessThanOrEqual(250);
  });
});

describe('water balance (L4) and decision (L5)', () => {
  it('AC8: worked check gives 5.00, 0.00, 5.50 mm', () => {
    const params = { taw: 137.79, raw: 75.78, p: 0.55 };
    const out = runBalance([
      { date: 'd1', precip: 0, et0: 5.0, kc: 1 },
      { date: 'd2', precip: 12, et0: 6.0, kc: 1 },
      { date: 'd3', precip: 0, et0: 5.5, kc: 1 },
    ], params);
    expect(out.map((d) => d.depletion.toFixed(2))).toEqual(['5.00', '0.00', '5.50']);
  });
  it('marks gaps and carries depletion forward', () => {
    const out = runBalance([
      { date: 'd1', precip: 0, et0: 5, kc: 1 },
      { date: 'd2', precip: null, et0: 5, kc: 1 },
    ], { taw: 100, raw: 50, p: 0.5 });
    expect(out[1].gap).toBe(true);
    expect(out[1].depletion).toBe(5);
  });
  it('never exceeds TAW and never goes negative', () => {
    const out = runBalance([{ date: 'd', precip: 0, et0: 500, kc: 1 }, { date: 'e', precip: 900, et0: 1, kc: 1 }], { taw: 100, raw: 50, p: 0.5 });
    expect(out[0].depletion).toBe(100);
    expect(out[1].depletion).toBe(0);
  });
  it('AC16: depletion 80 vs RAW 75.78 → Irrigate now, 80 mm', () => {
    expect(irrigationDecision(80, 75.78, [])).toEqual({ kind: 'irrigate_now', amountMm: 80 });
  });
  it('irrigate within k days when a day reaches 0.60', () => {
    expect(irrigationDecision(10, 75, [0.1, 0.3, 0.6, 0.8, 1, 1, 1])).toEqual({ kind: 'irrigate_soon', withinDays: 3 });
    expect(irrigationDecision(10, 75, [0, 0, 0, 0, 0, 0, 0.59])).toEqual({ kind: 'no_irrigation' });
  });
});

describe('stage and Kc (L3)', () => {
  it('day 0 is initial', () => {
    expect(stageFor('Wheat', 0)).toBe('initial');
  });
  it('halfway through development gives the linear midpoint 0.725', () => {
    expect(kcFor('Wheat', 20 + 15)).toBeCloseTo(0.725, 6);
  });
  it('first mid day gives 1.15', () => {
    expect(stageFor('Wheat', 50)).toBe('mid');
    expect(kcFor('Wheat', 50)).toBe(1.15);
  });
  it('AC9: GDD for 28.0 / 12.0 / base 0 is 20.0', () => {
    expect(gddDay(28, 12, 0)).toBe(20);
  });
});

describe('analog model (L6)', () => {
  it('AC10: Brier score of 0.8, 0.2, 0.6 vs 1, 0, 1 is 0.08', () => {
    expect(brierScore([0.8, 0.2, 0.6], [1, 0, 1])).toBeCloseTo(0.08, 10);
  });
  it('two seasons with flags 1 and 0 and equal weights give 0.5 for any w', () => {
    for (const w of [0.01, 0.5, 1, 7]) expect(weightedProbability([{ w, flag: 1 }, { w, flag: 0 }])).toBeCloseTo(0.5, 12);
  });
  it('identical states get weight 1', () => {
    const r = analogProbability({ depletionRatio: 0.3, stressDays: 2 }, [{ year: 2010, depletionRatio: 0.3, stressDays: 2, stressFlag: 1, criticalStressDays: 9 }]);
    expect(r.weights[0]).toBe(1);
    expect(r.prob).toBeCloseTo(2 / 3, 12);
  });
});

describe('market (L11) and harvest (L12)', () => {
  it('percentile of 2,000 against 1,500 1,800 2,100 2,400 is 50%', () => {
    expect(pricePercentile(2000, [1500, 1800, 2100, 2400])).toBe(0.5);
  });
  it('hold gain for P0 2,000, ratio 1.10, storage 25, 9% interest, 1 month is ₹160', () => {
    expect(holdGain(2000, 1.1, 1, 25, 9)).toBeCloseTo(160, 10);
  });
  it('AC19: fewer than 8 years of prices → Not enough price history, no recommendation', () => {
    const prices = Array.from({ length: 7 }, (_, i) => ({ year: 2018 + i, month: 4, price: 2000 + i }));
    prices.push({ year: 2025, month: 4, price: 2100 });
    const r = sellOrHold(prices, 2025, 4, { quantityQ: 20, storageCost: 25, interestPct: 9 });
    expect(r.status).toBe('insufficient');
    expect(r.recommendation).toBeNull();
  });
  it('recommends hold when holding paid reliably', () => {
    const prices = [];
    for (let y = 2010; y <= 2024; y++) prices.push({ year: y, month: 4, price: 2000 }, { year: y, month: 5, price: 2200 }, { year: y, month: 6, price: 2300 }, { year: y, month: 7, price: 2300 });
    prices.push({ year: 2025, month: 4, price: 2000 });
    const r = sellOrHold(prices, 2025, 4, { quantityQ: 10, storageCost: 25, interestPct: 9 });
    expect(r.status).toBe('ok');
    expect(r.recommendation).toBe('hold');
  });
  it('harvest loss: 4 rain days → 0.12, 12 rain days → 0.30 (capped)', () => {
    expect(harvestLoss(4)).toBeCloseTo(0.12, 10);
    expect(harvestLoss(12)).toBe(0.3);
  });
});

describe('verifier (L13)', () => {
  const facts: Fact[] = [{ id: 'depletion', label: 'Depletion', value: 42.0, unit: 'mm', source: 'x', fetchedAt: null }];
  it('AC17: passes "Irrigate 42 mm", fails "Irrigate 50 mm"', () => {
    expect(verifyText('Irrigate 42 mm', facts).ok).toBe(true);
    expect(verifyText('Irrigate 50 mm', facts).ok).toBe(false);
  });
  it('exempts dates, times and day counts', () => {
    expect(verifyText('On 2026-11-03, within 3 days, avoid spraying between 11:00 and 16:00. Irrigate 42.3 mm.', facts).ok).toBe(true);
  });
  it('checks rupees and percentages', () => {
    const f: Fact[] = [{ id: 'p', label: 'p', value: 2150, unit: '₹', source: 'x', fetchedAt: null }, { id: 'q', label: 'q', value: 62.5, unit: '%', source: 'x', fetchedAt: null }];
    expect(verifyText('Price ₹2,150 per quintal, 62.5% chance', f).ok).toBe(true);
    expect(verifyText('Price ₹2,300 per quintal', f).ok).toBe(false);
    expect(verifyText('a 70% chance', f).ok).toBe(false);
  });
});

describe('staleness (L16) and source state', () => {
  it('weather fetched 25 hours ago is stale', () => {
    const now = new Date('2026-11-01T12:00:00Z');
    expect(isStale('weather', new Date(now.getTime() - 25 * 3_600_000), now)).toBe(true);
    expect(isStale('weather', new Date(now.getTime() - 23 * 3_600_000), now)).toBe(false);
  });
  it('states', () => {
    const now = new Date();
    expect(sourceState({ configured: false, lastSuccessAt: null, lastErrorAt: null, staleHours: 24 })).toBe('not_configured');
    expect(sourceState({ configured: true, lastSuccessAt: now, lastErrorAt: new Date(now.getTime() + 1), staleHours: 24 })).toBe('failed');
    expect(sourceState({ configured: true, lastSuccessAt: now, lastErrorAt: null, staleHours: 24 })).toBe('ok');
  });
});

describe('alerts (L9)', () => {
  it('AC18: heavy rain at 64.5 mm, not at 64.4 mm', () => {
    expect(isHeavyRain(64.5)).toBe(true);
    expect(isHeavyRain(64.4)).toBe(false);
    const day = (p: number) => [{ date: '2026-11-02', precip: p, tmax: 30, tmin: 15 }];
    expect(protectiveAlerts(day(64.5), { depletion: 10, raw: 70, stage: 'mid' }).map((a) => a.type)).toEqual(['heavy_rain']);
    expect(protectiveAlerts(day(64.4), { depletion: 10, raw: 70, stage: 'mid' })).toEqual([]);
  });
  it('frost at 2.0 °C and heatwave at 40.0 °C', () => {
    const a = protectiveAlerts([{ date: 'a', precip: 0, tmax: 40, tmin: 2 }], { depletion: 30, raw: 50, stage: 'initial' });
    expect(a.map((x) => x.type).sort()).toEqual(['frost', 'heatwave']);
    expect(a.find((x) => x.type === 'frost')!.action).toContain('Cover seedlings');
  });
});

describe('outlooks (L7, L8)', () => {
  it('share of members reaching RAW by day k, excluding members with gaps', () => {
    const params = { taw: 100, raw: 20, p: 0.5 };
    const kc = Array(7).fill(1);
    const wet = { precip: Array(7).fill(10), et0: Array(7).fill(5) };
    const dry = { precip: Array(7).fill(0), et0: Array(7).fill(5) };
    const broken = { precip: [0, null, 0, 0, 0, 0, 0], et0: Array(7).fill(5) };
    const r = sevenDayOutlook(10, kc, [wet, dry, broken], params);
    expect(r.excluded).toBe(1);
    expect(r.probByDay[0]).toBe(0);
    expect(r.probByDay[1]).toBe(0.5);
    expect(r.probByDay[6]).toBe(0.5);
  });
  it('weekly probability of rain below half of normal', () => {
    const rows = weeklyBelowHalfNormal([[1, 20], [10, 2], [3, 30]], [10, 20]);
    expect(rows[0].prob).toBeCloseTo(2 / 3);
    expect(rows[1].prob).toBeCloseTo(1 / 3);
  });
});

describe('satellite verdict (L10)', () => {
  const band = { p25: 0.4, p75: 0.6 };
  it('covers each case', () => {
    expect(satelliteVerdict({ latestValue: 0.3, latestAgeDays: 3, band, stressProb: 0.7 })).toBe('agrees_below');
    expect(satelliteVerdict({ latestValue: 0.5, latestAgeDays: 3, band, stressProb: 0.7 })).toBe('no_stress_yet');
    expect(satelliteVerdict({ latestValue: 0.3, latestAgeDays: 3, band, stressProb: 0.2 })).toBe('unexplained_stress');
    expect(satelliteVerdict({ latestValue: 0.5, latestAgeDays: 3, band, stressProb: 0.2 })).toBe('agree_no_stress');
    expect(satelliteVerdict({ latestValue: 0.5, latestAgeDays: 25, band, stressProb: 0.2 })).toBe('no_clear_image');
  });
});

describe('field geometry (F2, AC4, AC5)', () => {
  it('AC5: a point outside India is rejected with the E4 message', () => {
    expect(() => checkGeometry(null, { lat: 51.5, lon: -0.12 }, 1)).toThrow(MSG.outside);
  });
  it('rejects both and neither', () => {
    expect(() => checkGeometry(null, null)).toThrow(MSG.noLocation);
    expect(() => checkGeometry({ type: 'Polygon', coordinates: [[[75.8, 22.7], [75.81, 22.7], [75.81, 22.71], [75.8, 22.7]]] }, { lat: 22.7, lon: 75.8 })).toThrow(MSG.both);
  });
  it('AC4: area within 0.5% of the geodesic area and centroid inside', () => {
    // ~200 m x ~200 m square near Indore. Geodesic area via spherical excess on the WGS84 authalic sphere.
    const lon0 = 75.85, lat0 = 22.72, d = 0.0018;
    const poly: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[lon0, lat0], [lon0 + d, lat0], [lon0 + d, lat0 + d], [lon0, lat0 + d], [lon0, lat0]]] };
    const g = checkGeometry(poly, null);
    const R = 6371007.2;
    const rad = Math.PI / 180;
    const expected = (R * R * (d * rad) * Math.abs(Math.sin((lat0 + d) * rad) - Math.sin(lat0 * rad))) / 10_000;
    expect(Math.abs(g.areaHa - expected) / expected).toBeLessThan(0.005);
    expect(g.centroidLat).toBeGreaterThan(lat0);
    expect(g.centroidLat).toBeLessThan(lat0 + d);
    expect(g.centroidLon).toBeGreaterThan(lon0);
    expect(g.centroidLon).toBeLessThan(lon0 + d);
  });
});
