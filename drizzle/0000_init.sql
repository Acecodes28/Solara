CREATE TYPE "crop" AS ENUM ('Wheat', 'Soybean');
CREATE TYPE "stage" AS ENUM ('initial', 'development', 'mid', 'late');
CREATE TYPE "weather_kind" AS ENUM ('archive', 'recent', 'forecast');
CREATE TYPE "alert_type" AS ENUM ('irrigate_now', 'frost', 'heavy_rain', 'heatwave', 'price_spike');
CREATE TYPE "ingest_kind" AS ENUM ('history', 'soil', 'ndvi', 'prices');
CREATE TYPE "ingest_status" AS ENUM ('queued', 'running', 'done', 'failed');

CREATE TABLE "fields" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "browser_key" text NOT NULL,
  "name" text NOT NULL CHECK (char_length("name") BETWEEN 1 AND 60),
  "crop" "crop" NOT NULL,
  "sowing_date" date NOT NULL CHECK ("sowing_date" >= DATE '2005-01-01'),
  "centroid_lat" numeric(9,6) NOT NULL,
  "centroid_lon" numeric(9,6) NOT NULL,
  "polygon" jsonb,
  "area_ha" numeric(8,3) NOT NULL CHECK ("area_ha" BETWEEN 0.05 AND 500),
  "mandi" text,
  "expected_yield_q_per_ha" numeric(6,2),
  "storage_cost_per_q_month" numeric(8,2) NOT NULL DEFAULT 25,
  "interest_pct_year" numeric(5,2) NOT NULL DEFAULT 9,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "fields_browser_key_idx" ON "fields" ("browser_key");

CREATE TABLE "soil_profiles" (
  "field_id" uuid PRIMARY KEY REFERENCES "fields"("id") ON DELETE CASCADE,
  "sand_pct" double precision NOT NULL,
  "clay_pct" double precision NOT NULL,
  "soc_pct" double precision NOT NULL,
  "om_pct" double precision NOT NULL,
  "awc_mm_per_m" double precision NOT NULL,
  "source" text NOT NULL,
  "fetched_at" timestamptz NOT NULL
);

CREATE TABLE "weather_days" (
  "field_id" uuid NOT NULL REFERENCES "fields"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "kind" "weather_kind" NOT NULL,
  "precip_mm" double precision,
  "tmax_c" double precision,
  "tmin_c" double precision,
  "et0_mm" double precision,
  "source" text NOT NULL,
  "fetched_at" timestamptz NOT NULL,
  PRIMARY KEY ("field_id", "date", "kind")
);

CREATE TABLE "balance_days" (
  "field_id" uuid NOT NULL REFERENCES "fields"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "stage" "stage" NOT NULL,
  "kc" double precision NOT NULL,
  "etc_mm" double precision,
  "ks" double precision NOT NULL,
  "depletion_mm" double precision NOT NULL CHECK ("depletion_mm" >= 0),
  "raw_mm" double precision NOT NULL,
  "taw_mm" double precision NOT NULL,
  "irrigation_mm" double precision NOT NULL DEFAULT 0 CHECK ("irrigation_mm" >= 0),
  "precip_mm" double precision,
  "gap" boolean NOT NULL DEFAULT false,
  PRIMARY KEY ("field_id", "date")
);

CREATE TABLE "season_outcomes" (
  "field_id" uuid NOT NULL REFERENCES "fields"("id") ON DELETE CASCADE,
  "season_year" integer NOT NULL,
  "critical_stress_days" integer NOT NULL,
  "stress_flag" boolean NOT NULL,
  "predicted_prob" double precision,
  PRIMARY KEY ("field_id", "season_year")
);

CREATE TABLE "outlooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "field_id" uuid NOT NULL REFERENCES "fields"("id") ON DELETE CASCADE,
  "as_of_date" date NOT NULL,
  "day_offset" integer CHECK ("day_offset" BETWEEN 1 AND 7),
  "prob_irrigate_by_day" double precision CHECK ("prob_irrigate_by_day" BETWEEN 0 AND 1),
  "weekly_offset" integer CHECK ("weekly_offset" BETWEEN 2 AND 6),
  "prob_rain_below_half_normal" double precision CHECK ("prob_rain_below_half_normal" BETWEEN 0 AND 1),
  "normal_mm" double precision,
  "members" integer,
  "excluded" integer,
  "source" text NOT NULL,
  "fetched_at" timestamptz NOT NULL
);
CREATE INDEX "outlooks_field_idx" ON "outlooks" ("field_id", "as_of_date");

CREATE TABLE "ndvi_days" (
  "field_id" uuid NOT NULL REFERENCES "fields"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "ndvi_mean" double precision,
  "cloud_free" boolean NOT NULL,
  "source" text NOT NULL,
  "fetched_at" timestamptz NOT NULL,
  PRIMARY KEY ("field_id", "date")
);

CREATE TABLE "price_months" (
  "commodity" text NOT NULL,
  "mandi" text NOT NULL,
  "state" text,
  "district" text,
  "year" integer NOT NULL,
  "month" integer NOT NULL CHECK ("month" BETWEEN 1 AND 12),
  "modal_price_rs_per_q" double precision NOT NULL,
  "min_price" double precision,
  "max_price" double precision,
  "arrivals_tonnes" double precision,
  "source" text NOT NULL,
  "fetched_at" timestamptz NOT NULL,
  PRIMARY KEY ("commodity", "mandi", "year", "month")
);

CREATE TABLE "advice" (
  "field_id" uuid NOT NULL REFERENCES "fields"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "items" jsonb NOT NULL,
  "wording" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("field_id", "date")
);

CREATE TABLE "field_results" (
  "field_id" uuid PRIMARY KEY REFERENCES "fields"("id") ON DELETE CASCADE,
  "computed_at" timestamptz NOT NULL,
  "summary" jsonb NOT NULL
);

CREATE TABLE "alert_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "field_id" uuid NOT NULL REFERENCES "fields"("id") ON DELETE CASCADE,
  "telegram_chat_id" bigint NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "alert_links_uq" ON "alert_links" ("field_id", "telegram_chat_id");

CREATE TABLE "alert_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "field_id" uuid NOT NULL REFERENCES "fields"("id") ON DELETE CASCADE,
  "type" "alert_type" NOT NULL,
  "date" date NOT NULL,
  "sent_at" timestamptz
);
CREATE UNIQUE INDEX "alert_events_uq" ON "alert_events" ("field_id", "type", "date");

CREATE TABLE "ingest_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "field_id" uuid REFERENCES "fields"("id") ON DELETE CASCADE,
  "kind" "ingest_kind" NOT NULL,
  "status" "ingest_status" NOT NULL,
  "message" text,
  "started_at" timestamptz,
  "finished_at" timestamptz
);
CREATE INDEX "ingest_jobs_field_idx" ON "ingest_jobs" ("field_id");

CREATE TABLE "source_status" (
  "source_name" text PRIMARY KEY,
  "last_success_at" timestamptz,
  "last_error" text,
  "last_error_at" timestamptz
);

CREATE TABLE "seed_locations" (
  "name" text PRIMARY KEY,
  "lat" double precision NOT NULL,
  "lon" double precision NOT NULL,
  "district" text,
  "state" text,
  "source" text NOT NULL,
  "fetched_at" timestamptz NOT NULL
);
