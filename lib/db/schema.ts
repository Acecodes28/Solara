import {
  pgTable, uuid, text, date, numeric, doublePrecision, jsonb, timestamp, integer, boolean, bigint, pgEnum,
  uniqueIndex, index, primaryKey,
} from 'drizzle-orm/pg-core';

export const cropEnum = pgEnum('crop', ['Wheat', 'Soybean']);
export const stageEnum = pgEnum('stage', ['initial', 'development', 'mid', 'late']);
export const weatherKindEnum = pgEnum('weather_kind', ['archive', 'recent', 'forecast']);
export const alertTypeEnum = pgEnum('alert_type', ['irrigate_now', 'frost', 'heavy_rain', 'heatwave', 'price_spike']);
export const ingestKindEnum = pgEnum('ingest_kind', ['history', 'soil', 'ndvi', 'prices']);
export const ingestStatusEnum = pgEnum('ingest_status', ['queued', 'running', 'done', 'failed']);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const fields = pgTable('fields', {
  id: uuid('id').primaryKey().defaultRandom(),
  browserKey: text('browser_key').notNull(),
  name: text('name').notNull(),
  crop: cropEnum('crop').notNull(),
  sowingDate: date('sowing_date', { mode: 'string' }).notNull(),
  centroidLat: numeric('centroid_lat', { precision: 9, scale: 6, mode: 'number' }).notNull(),
  centroidLon: numeric('centroid_lon', { precision: 9, scale: 6, mode: 'number' }).notNull(),
  polygon: jsonb('polygon'),
  areaHa: numeric('area_ha', { precision: 8, scale: 3, mode: 'number' }).notNull(),
  mandi: text('mandi'),
  expectedYieldQPerHa: numeric('expected_yield_q_per_ha', { precision: 6, scale: 2, mode: 'number' }),
  storageCostPerQMonth: numeric('storage_cost_per_q_month', { precision: 8, scale: 2, mode: 'number' }).notNull().default(25),
  interestPctYear: numeric('interest_pct_year', { precision: 5, scale: 2, mode: 'number' }).notNull().default(9),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('fields_browser_key_idx').on(t.browserKey)]);

export const soilProfiles = pgTable('soil_profiles', {
  fieldId: uuid('field_id').primaryKey().references(() => fields.id, { onDelete: 'cascade' }),
  sandPct: doublePrecision('sand_pct').notNull(),
  clayPct: doublePrecision('clay_pct').notNull(),
  socPct: doublePrecision('soc_pct').notNull(),
  omPct: doublePrecision('om_pct').notNull(),
  awcMmPerM: doublePrecision('awc_mm_per_m').notNull(),
  source: text('source').notNull(),
  fetchedAt: ts('fetched_at').notNull(),
});

export const weatherDays = pgTable('weather_days', {
  fieldId: uuid('field_id').notNull().references(() => fields.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  kind: weatherKindEnum('kind').notNull(),
  precipMm: doublePrecision('precip_mm'),
  tmaxC: doublePrecision('tmax_c'),
  tminC: doublePrecision('tmin_c'),
  et0Mm: doublePrecision('et0_mm'),
  source: text('source').notNull(),
  fetchedAt: ts('fetched_at').notNull(),
}, (t) => [primaryKey({ columns: [t.fieldId, t.date, t.kind] })]);

export const balanceDays = pgTable('balance_days', {
  fieldId: uuid('field_id').notNull().references(() => fields.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  stage: stageEnum('stage').notNull(),
  kc: doublePrecision('kc').notNull(),
  etcMm: doublePrecision('etc_mm'),
  ks: doublePrecision('ks').notNull(),
  depletionMm: doublePrecision('depletion_mm').notNull(),
  rawMm: doublePrecision('raw_mm').notNull(),
  tawMm: doublePrecision('taw_mm').notNull(),
  irrigationMm: doublePrecision('irrigation_mm').notNull().default(0),
  precipMm: doublePrecision('precip_mm'),
  gap: boolean('gap').notNull().default(false),
}, (t) => [primaryKey({ columns: [t.fieldId, t.date] })]);

export const seasonOutcomes = pgTable('season_outcomes', {
  fieldId: uuid('field_id').notNull().references(() => fields.id, { onDelete: 'cascade' }),
  seasonYear: integer('season_year').notNull(),
  criticalStressDays: integer('critical_stress_days').notNull(),
  stressFlag: boolean('stress_flag').notNull(),
  predictedProb: doublePrecision('predicted_prob'),
}, (t) => [primaryKey({ columns: [t.fieldId, t.seasonYear] })]);

export const outlooks = pgTable('outlooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  fieldId: uuid('field_id').notNull().references(() => fields.id, { onDelete: 'cascade' }),
  asOfDate: date('as_of_date', { mode: 'string' }).notNull(),
  dayOffset: integer('day_offset'),
  probIrrigateByDay: doublePrecision('prob_irrigate_by_day'),
  weeklyOffset: integer('weekly_offset'),
  probRainBelowHalfNormal: doublePrecision('prob_rain_below_half_normal'),
  normalMm: doublePrecision('normal_mm'),
  members: integer('members'),
  excluded: integer('excluded'),
  startDepletionMm: doublePrecision('start_depletion_mm'),
  source: text('source').notNull(),
  fetchedAt: ts('fetched_at').notNull(),
}, (t) => [index('outlooks_field_idx').on(t.fieldId, t.asOfDate)]);

export const ndviDays = pgTable('ndvi_days', {
  fieldId: uuid('field_id').notNull().references(() => fields.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  ndviMean: doublePrecision('ndvi_mean'),
  cloudFree: boolean('cloud_free').notNull(),
  source: text('source').notNull(),
  fetchedAt: ts('fetched_at').notNull(),
}, (t) => [primaryKey({ columns: [t.fieldId, t.date] })]);

export const priceMonths = pgTable('price_months', {
  commodity: text('commodity').notNull(),
  mandi: text('mandi').notNull(),
  state: text('state'),
  district: text('district'),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  modalPriceRsPerQ: doublePrecision('modal_price_rs_per_q').notNull(),
  minPrice: doublePrecision('min_price'),
  maxPrice: doublePrecision('max_price'),
  arrivalsTonnes: doublePrecision('arrivals_tonnes'),
  source: text('source').notNull(),
  fetchedAt: ts('fetched_at').notNull(),
}, (t) => [primaryKey({ columns: [t.commodity, t.mandi, t.year, t.month] })]);

export const advice = pgTable('advice', {
  fieldId: uuid('field_id').notNull().references(() => fields.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  items: jsonb('items').notNull(),
  wording: text('wording').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.fieldId, t.date] })]);

export const fieldResults = pgTable('field_results', {
  fieldId: uuid('field_id').primaryKey().references(() => fields.id, { onDelete: 'cascade' }),
  computedAt: ts('computed_at').notNull(),
  summary: jsonb('summary').notNull(),
});

export const alertLinks = pgTable('alert_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  fieldId: uuid('field_id').notNull().references(() => fields.id, { onDelete: 'cascade' }),
  telegramChatId: bigint('telegram_chat_id', { mode: 'number' }).notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('alert_links_uq').on(t.fieldId, t.telegramChatId)]);

export const alertEvents = pgTable('alert_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  fieldId: uuid('field_id').notNull().references(() => fields.id, { onDelete: 'cascade' }),
  type: alertTypeEnum('type').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  sentAt: ts('sent_at'),
}, (t) => [uniqueIndex('alert_events_uq').on(t.fieldId, t.type, t.date)]);

export const ingestJobs = pgTable('ingest_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  fieldId: uuid('field_id').references(() => fields.id, { onDelete: 'cascade' }),
  kind: ingestKindEnum('kind').notNull(),
  status: ingestStatusEnum('status').notNull(),
  message: text('message'),
  startedAt: ts('started_at'),
  finishedAt: ts('finished_at'),
}, (t) => [index('ingest_jobs_field_idx').on(t.fieldId)]);

export const sourceStatus = pgTable('source_status', {
  sourceName: text('source_name').primaryKey(),
  lastSuccessAt: ts('last_success_at'),
  lastError: text('last_error'),
  lastErrorAt: ts('last_error_at'),
});

export const seedLocations = pgTable('seed_locations', {
  name: text('name').primaryKey(),
  lat: doublePrecision('lat').notNull(),
  lon: doublePrecision('lon').notNull(),
  district: text('district'),
  state: text('state'),
  source: text('source').notNull(),
  fetchedAt: ts('fetched_at').notNull(),
});

export const irrigationLogs = pgTable('irrigation_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  fieldId: uuid('field_id').notNull().references(() => fields.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  amountMm: doublePrecision('amount_mm').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('irrigation_logs_uq').on(t.fieldId, t.date)]);

export type Field = typeof fields.$inferSelect;
export type WeatherDay = typeof weatherDays.$inferSelect;
export type SoilProfile = typeof soilProfiles.$inferSelect;
export type PriceMonth = typeof priceMonths.$inferSelect;
export type NdviDay = typeof ndviDays.$inferSelect;
