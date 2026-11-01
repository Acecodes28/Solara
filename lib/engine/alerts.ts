import { THRESHOLDS } from '../config/thresholds';

export type AlertType = 'frost' | 'heavy_rain' | 'heatwave';

export interface ForecastDay {
  date: string;
  precip: number | null;
  tmax: number | null;
  tmin: number | null;
}

export interface Alert {
  type: AlertType;
  date: string;
  threshold: number;
  value: number;
  unit: string;
  action: string;
  actionHi: string;
  basis: 'forecast' | 'ensemble';
}

export const isHeavyRain = (mm: number) => mm >= THRESHOLDS.heavyRainMm;
export const isFrost = (tmin: number) => tmin <= THRESHOLDS.frostTminC;
export const isHeat = (tmax: number) => tmax >= THRESHOLDS.heatwaveTmaxC;

/**
 * L9. next3 = forecast for the next three days. ensembleFrostShare[i] = share of members with tmin <= 2 °C on day i.
 */
export function protectiveAlerts(
  next3: ForecastDay[],
  ctx: { depletion: number | null; raw: number | null; stage: string | null },
  ensembleFrostShare: (number | null)[] = [],
): Alert[] {
  const alerts: Alert[] = [];
  const days = next3.slice(0, 3);

  const frostIdx = days.findIndex((d, i) => (d.tmin != null && isFrost(d.tmin)) || (ensembleFrostShare[i] ?? 0) >= THRESHOLDS.frostEnsembleShare);
  if (frostIdx >= 0) {
    const d = days[frostIdx];
    const viaForecast = d.tmin != null && isFrost(d.tmin);
    const deep = ctx.depletion != null && ctx.depletion >= THRESHOLDS.frostIrrigateDepletionMm;
    const early = ctx.stage === 'initial';
    alerts.push({
      type: 'frost', date: d.date, threshold: THRESHOLDS.frostTminC,
      value: viaForecast ? d.tmin! : Math.round((ensembleFrostShare[frostIdx] ?? 0) * 1000) / 10,
      unit: viaForecast ? '°C' : '% of members',
      basis: viaForecast ? 'forecast' : 'ensemble',
      action: [deep ? 'Irrigate before the frost night.' : 'Irrigate before the frost night if depletion reaches 25 mm.', early ? 'Cover seedlings at night.' : ''].filter(Boolean).join(' '),
      actionHi: [deep ? 'पाला पड़ने वाली रात से पहले सिंचाई करें।' : 'कमी 25 mm तक पहुँचे तो पाले की रात से पहले सिंचाई करें।', early ? 'रात में पौध को ढकें।' : ''].filter(Boolean).join(' '),
    });
  }

  const rain = days.find((d) => d.precip != null && isHeavyRain(d.precip));
  if (rain) {
    alerts.push({
      type: 'heavy_rain', date: rain.date, threshold: THRESHOLDS.heavyRainMm, value: rain.precip!, unit: 'mm', basis: 'forecast',
      action: 'Check field drainage and delay top-dressing fertiliser by three days.',
      actionHi: 'खेत की जल निकासी जाँचें और ऊपरी खाद तीन दिन टालें।',
    });
  }

  const heat = days.find((d) => d.tmax != null && isHeat(d.tmax));
  if (heat) {
    const shouldIrrigate = ctx.depletion != null && ctx.raw != null && ctx.depletion >= THRESHOLDS.heatIrrigateRawShare * ctx.raw;
    alerts.push({
      type: 'heatwave', date: heat.date, threshold: THRESHOLDS.heatwaveTmaxC, value: heat.tmax!, unit: '°C', basis: 'forecast',
      action: `${shouldIrrigate ? 'Irrigate in the early morning. ' : ''}Avoid spraying between 11:00 and 16:00.`,
      actionHi: `${shouldIrrigate ? 'सुबह जल्दी सिंचाई करें। ' : ''}11:00 से 16:00 के बीच छिड़काव न करें।`,
    });
  }
  return alerts;
}
