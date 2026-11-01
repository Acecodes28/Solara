export const THRESHOLDS = {
  frostTminC: 2.0,
  frostEnsembleShare: 0.5,
  frostIrrigateDepletionMm: 25,
  heavyRainMm: 64.5, // IMD "heavy rain" lower bound
  heatwaveTmaxC: 40.0,
  heatIrrigateRawShare: 0.5,
  irrigateSoonProb: 0.6,
  stressDaysFlag: 5,
  analogDepletionScale: 0.1,
  analogStressScale: 5,
  minAnalogSeasons: 10,
  minPriceYears: 8,
  holdHitRate: 0.6,
  harvestLossPerRainDay: 0.03, // assumption, labelled as such in the UI
  harvestLossCap: 0.3,
  rainDayMm: 1,
  satelliteRecentDays: 21,
  satelliteCloudMaxPct: 40,
  riskRedAt: 0.5,
  riskAmberAt: 0.25,
} as const;

/** Staleness limits in hours (L16). */
export const STALE_HOURS = {
  weather: 24,
  satellite: 24 * 7,
  prices: 24 * 60,
  soil: 24 * 365,
  service: 24 * 7,
} as const;

export const DEFAULT_STORAGE_COST = 25;
export const DEFAULT_INTEREST_PCT = 9;

export const INDIA_BOUNDS = { minLat: 6.0, maxLat: 37.5, minLon: 68.0, maxLon: 97.5 };
export const HISTORY_START = '2005-01-01';
export const NDVI_START = '2017-01-01';
