export type Crop = 'Wheat' | 'Soybean';
export type Stage = 'initial' | 'development' | 'mid' | 'late';

export interface CropParams {
  stageLengths: [number, number, number, number]; // initial, development, mid, late (days)
  kcIni: number;
  kcMid: number;
  kcEnd: number;
  rootDepthM: number;
  p: number;
  baseTempC: number;
  /** Default expected yield (q/ha); a labelled assumption the user can override. */
  defaultYieldQPerHa: number;
  /** Days after sowing at which the eight candidate harvest weeks start. */
  harvestStartDay: number;
  /** Calendar month (1-12) that opens the post-harvest sell window in Madhya Pradesh. */
  sellMonth: number;
  /** CEDA / Agmarknet commodity name. */
  commodityName: string;
}

/**
 * Kc, root depth and p: FAO Irrigation and Drainage Paper 56, Tables 12 and 22.
 * Stage lengths: FAO-56 Table 11 fallbacks, cross-checked against Madhya Pradesh durations
 * (timely-sown wheat ~120-130 days; soybean JS-series varieties ~90-105 days). See /methodology.
 */
export const CROPS: Record<Crop, CropParams> = {
  Wheat: {
    stageLengths: [20, 30, 50, 25],
    kcIni: 0.3,
    kcMid: 1.15,
    kcEnd: 0.25,
    rootDepthM: 1.0,
    p: 0.55,
    baseTempC: 0,
    defaultYieldQPerHa: 20,
    harvestStartDay: 118,
    sellMonth: 4,
    commodityName: 'Wheat',
  },
  Soybean: {
    stageLengths: [15, 25, 45, 20],
    kcIni: 0.4,
    kcMid: 1.15,
    kcEnd: 0.5,
    rootDepthM: 0.8,
    p: 0.5,
    baseTempC: 10,
    defaultYieldQPerHa: 10,
    harvestStartDay: 98,
    sellMonth: 10,
    commodityName: 'Soybean',
  },
};

export const seasonLength = (crop: Crop) => CROPS[crop].stageLengths.reduce((a, b) => a + b, 0);
