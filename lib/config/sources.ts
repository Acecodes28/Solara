import { STALE_HOURS } from './thresholds';

export const SOURCE = {
  archive: 'Open-Meteo archive',
  forecast: 'Open-Meteo forecast',
  ensemble: 'Open-Meteo ensemble',
  weekly: 'Open-Meteo weekly ensemble',
  soil: 'SoilGrids',
  copernicus: 'Copernicus',
  ceda: 'CEDA',
  datagov: 'data.gov.in',
  indiaPost: 'India Post',
  telegram: 'Telegram',
  gemini: 'Gemini',
} as const;

export type SourceName = (typeof SOURCE)[keyof typeof SOURCE];

export interface SourceMeta {
  name: SourceName;
  /** Environment variables that must all be set; empty means no key needed. */
  env: string[];
  staleHours: number;
  credit: string;
  setup?: string;
}

export const SOURCES: SourceMeta[] = [
  { name: SOURCE.archive, env: [], staleHours: STALE_HOURS.weather, credit: 'Weather data by Open-Meteo.com. ERA5 reanalysis: Copernicus Climate Change Service (C3S), ECMWF.' },
  { name: SOURCE.forecast, env: [], staleHours: STALE_HOURS.weather, credit: 'Weather data by Open-Meteo.com' },
  { name: SOURCE.ensemble, env: [], staleHours: STALE_HOURS.weather, credit: 'ECMWF IFS 0.25° ensemble via Open-Meteo.com' },
  { name: SOURCE.weekly, env: [], staleHours: STALE_HOURS.weather, credit: 'ECMWF SEAS5 seasonal ensemble via Open-Meteo.com' },
  { name: SOURCE.soil, env: [], staleHours: STALE_HOURS.soil, credit: 'SoilGrids v2.0, ISRIC World Soil Information (CC BY 4.0)' },
  { name: SOURCE.copernicus, env: ['COPERNICUS_CLIENT_ID', 'COPERNICUS_CLIENT_SECRET'], staleHours: STALE_HOURS.satellite, credit: 'Contains modified Copernicus Sentinel-2 data, processed by Copernicus Data Space Ecosystem', setup: 'Create a free Copernicus Data Space account, add an OAuth client in the Sentinel Hub dashboard, then set COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET.' },
  { name: SOURCE.ceda, env: ['CEDA_API_KEY'], staleHours: STALE_HOURS.prices, credit: 'CEDA Agri Market Data, Centre for Economic Data and Analysis, Ashoka University (source: Agmarknet)', setup: 'Get a free key at api.ceda.ashoka.edu.in and set CEDA_API_KEY, or download CSVs from agmarknet.ceda.ashoka.edu.in into data/raw/ceda/ and run npm run import:ceda.' },
  { name: SOURCE.datagov, env: ['DATA_GOV_IN_API_KEY'], staleHours: STALE_HOURS.prices, credit: 'Agmarknet daily prices via data.gov.in (OGD India)', setup: 'Register at data.gov.in, copy your API key and set DATA_GOV_IN_API_KEY.' },
  { name: SOURCE.indiaPost, env: [], staleHours: STALE_HOURS.service, credit: 'India Post pincode directory via api.postalpincode.in' },
  { name: SOURCE.telegram, env: ['TELEGRAM_BOT_TOKEN'], staleHours: STALE_HOURS.service, credit: 'Telegram Bot API', setup: 'Create a bot with @BotFather and set TELEGRAM_BOT_TOKEN.' },
  { name: SOURCE.gemini, env: ['GEMINI_API_KEY'], staleHours: STALE_HOURS.service, credit: 'Google Gemini (wording only; never computes numbers)', setup: 'Create a free key at aistudio.google.com and set GEMINI_API_KEY.' },
];

export const isConfigured = (m: SourceMeta) => m.env.every((k) => !!process.env[k]);
export const sourceMeta = (name: string) => SOURCES.find((s) => s.name === name);
