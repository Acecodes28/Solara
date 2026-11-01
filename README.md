# Solara Field Advisor

Per-field irrigation decisions and season risk for **Wheat and Soybean in India**, with **Solara AI**, a bilingual (English / Hindi) field advisor that answers only from each field's own data.

For each field, drawn on a map or found by GPS, pincode or district, Solara combines 20 years of real daily ERA5 weather, the live forecast, two ensemble forecasts, SoilGrids soil data, Sentinel-2 vegetation and CEDA mandi prices to show:

- the irrigation decision in millimetres (FAO-56 root-zone water balance)
- the chance of a water-stress period in the critical stage, from an analog model fitted per field on every past season since 2005, with leave-one-season-out validation (Brier score, baseline, skill)
- a 7-day irrigation outlook (51-member ECMWF ensemble) and a 6-week dry-spell outlook (51-member SEAS5)
- frost, heavy-rain and heatwave alerts with actions
- a satellite check against past seasons
- sell-or-hold and harvest timing from past years, and a backtest of both

Every number shows its source and fetch time. **No sample, mock or hand-written data is used anywhere.** If a source is unavailable, the screen says so and shows the last stored real value.

> Decision aid. Not agronomy or financial advice.

## Quick start

Prerequisites: Node.js 20 or later and internet access. No database install is needed for local use.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Open `.env.local` and set `CRON_SECRET` to any long random string (other keys are optional, see below).

```bash
npm run dev
```

Open http://localhost:3000, click **Add a field**, draw your field, choose the crop and sowing date, and save. Ingestion takes under a minute: about 8,000 days of weather, the soil profile, satellite and prices. The field page opens when it finishes.

Local development uses **PGlite**, an embedded Postgres, stored in `data/pgdata` (`DATABASE_URL=pglite://./data/pgdata`). The schema and SQL are the same as production Postgres. Migrations in `drizzle/` apply automatically on first use (`npm run db:migrate` applies them explicitly).

## Configuration

| Variable | Needed for | Without it |
|---|---|---|
| `DATABASE_URL` | Required. `pglite://./data/pgdata` locally, or a Postgres URL (Supabase) | App cannot start |
| `CRON_SECRET` | Required. Protects `GET /api/cron/daily` | Daily job always returns 401 |
| `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`) | Solara AI wording (free tier at aistudio.google.com) | Fixed templates and rule-based answers, labelled "Standard wording" |
| `COPERNICUS_CLIENT_ID`, `COPERNICUS_CLIENT_SECRET` | Satellite tab (free Copernicus Data Space account, OAuth client) | Satellite tab shows "Satellite not configured" |
| `CEDA_API_KEY` | Mandi price history (free at api.ceda.ashoka.edu.in) | Import CEDA CSVs instead (below), or the Market tab stays empty |
| `DATA_GOV_IN_API_KEY` | Optional live mandi reading (data.gov.in) | No live line |
| `TELEGRAM_BOT_TOKEN` | Telegram alerts (@BotFather) | Alerts show only in the app |
| `OPEN_METEO_BASE_URL` | Forecast API base (default `https://api.open-meteo.com`) | |
| `NEXT_PUBLIC_APP_NAME` | Page title (default `Solara Field Advisor`) | |

Open-Meteo, SoilGrids, India Post and the geocoder need no keys. **Data Health** (`/health`) shows each source as ok, stale, failed or not configured, with setup notes.

### Mandi prices from CSV (no key needed)

Download monthly Wheat or Soybean CSVs from https://agmarknet.ceda.ashoka.edu.in into `data/raw/ceda/`. Stop the dev server, then run:

```bash
npm run import:ceda
```

See `data/raw/ceda/README.md` for column handling. Then choose the mandi on a field's Market tab.

## Solara AI

- Ask about one field in English or Hindi, typed or spoken (browser speech recognition), and hear replies read aloud.
- Answers come only from the field's fact sheet (depletion, RAW/TAW, outlook probabilities, stress chance, alerts, prices). Each answer lists the figures used, with source and fetch time.
- With a Gemini key the model words the advice and answers at temperature 0. A verifier checks **every number** against the facts (±0.5 mm, ±0.5 percentage points, ±0.5 °C, ±₹1) and discards the model text if any number fails. The model never computes numbers.
- Without a key, a rule-based engine answers irrigation, frost, heat, rain, stress, price, stage and soil questions in both languages.
- Questions outside the data get a fixed refusal.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` | No-mock-data scan, production build, then a scan of the browser bundle for secret names and values |
| `npm run start` | Production server |
| `npm run lint` | ESLint and TypeScript |
| `npm test` | Unit tests (Vitest), covering every case in spec section 10B |
| `npm run test:e2e` | Playwright tests (run `npx playwright install chromium` once; uses `npm run start`, so build first) |
| `npm run seed` | Geocodes the four Madhya Pradesh seed locations (also happens on first use) |
| `npm run import:ceda` | Imports CEDA CSVs from `data/raw/ceda/` |
| `npm run db:migrate` | Applies SQL migrations |

## Deployment (Vercel + Supabase)

1. Create a Supabase project and set `DATABASE_URL` to its Postgres connection string (the pooled connection works; prepared statements are disabled).
2. Set `CRON_SECRET` and any optional keys in Vercel project settings.
3. Deploy. `vercel.json` schedules `/api/cron/daily` once a day. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.

Ingestion runs after the response with `waitUntil`; each step is limited to 120 seconds and external calls to 15 seconds (archive and satellite calls allow up to 60 seconds).

## Project structure

```
app/              pages and API routes (one folder per endpoint)
components/       shell, maps, tabs, charts, cards, banners, skeletons
lib/sources/      one client per external service, validated with Zod
lib/engine/       soil, stage, balance, decision, analog, outlook, alerts, satellite, market, harvest, backtest, advice, verify, staleness
lib/services/     ingestion, compute pipeline, advice, Solara AI, market, alerts, health
lib/config/       crop parameters, thresholds, sources, seed locations
lib/db/           Drizzle schema and database client
lib/i18n/         English and Hindi strings
scripts/          CEDA import, seeding, migration, build checks
drizzle/          SQL migrations
tests/unit/       engine tests
tests/e2e/        API and page checks
data/raw/ceda/    CEDA CSV files you download
```

## API

All routes validate input with strict Zod schemas (unknown fields are rejected), are limited to 60 requests per minute per IP, and return JSON errors.

`GET /api/health` · `GET /api/location/pincode/{pin}` · `GET /api/location/search?q=` · `GET /api/location/seeds` · `POST|GET /api/fields` · `GET|PATCH|DELETE /api/fields/{id}` · `POST /api/fields/{id}/ingest` · `GET /api/fields/{id}/weather|balance|advice|risk|outlook|satellite|market|harvest|backtest` · `GET|POST|DELETE /api/fields/{id}/irrigation` · `GET /api/market/commodities` · `POST /api/advisor` · `GET|POST /api/alerts/telegram` · `DELETE /api/alerts/telegram/{id}` · `GET /api/cron/daily`

The browser sends its random key in the `x-browser-key` header. Only the creating browser can edit or delete a field, log irrigation or link alerts.

## Assumptions and differences from the specification

- **Renamed** from Khet Drishti to **Solara**; the assistant and Telegram bot are **Solara AI**.
- **Local database**: PGlite (embedded Postgres) when `DATABASE_URL` starts with `pglite:`; postgres-js otherwise. Migrations are hand-written SQL applied by a small runner, because `drizzle-kit` could not install in the build environment (Windows path-length limit). The Drizzle ORM schema in `lib/db/schema.ts` matches the SQL.
- **SoilGrids**: the REST API was returning 503 during the build, so the client falls back to ISRIC's WCS service for the same SoilGrids v2.0 maps (median of mapped pixels near the field).
- **Weekly ensemble**: Open-Meteo has no weekly-aggregate endpoint; the 51-member SEAS5 seasonal ensemble (daily, 45 days) is summed into weeks 2–6.
- **Irrigation log** (addition): farmers can log irrigation they applied. It feeds `irrigation_mm` in the balance, which the spec's data model already has.
- **Point fields** ask for the area in hectares, because a point has no area and quantity needs it.
- **Season complete**: when the season has ended, no irrigation decision or outlook is shown, and the risk tab reflects the observed season.
- **Harvest window**: candidate weeks start at day 118 (wheat) and 98 (soybean) after sowing. The sell window opens in April (wheat) and October (soybean).
- **CEDA API**: the endpoints (`/v1/agmarknet/commodities`, `geographies`, `markets`, `prices`, Bearer auth) were found by probing, because the documentation needs registration. Field names are matched by pattern and any mismatch is reported on Data Health. CSV import is the guaranteed path.
- **PDF report (N3)** uses the browser's print-to-PDF with a print stylesheet. **Field comparison (N4)** is on the Fields page.
- **Animations** stay at or under 200 ms and respect `prefers-reduced-motion`.

## Known limitations

- Without a CEDA key or imported CSVs, Market, Harvest prices and the price backtest stay empty (by design: no invented prices).
- Satellite needs Copernicus credentials. That client follows the documented Statistics API but could not be exercised end to end without credentials.
- The analog stress model's skill varies by location and can be negative. It is always shown.
- Rate limiting and the Copernicus token cache are per server instance.
- Clearing browser storage loses the link to your field list (field links still work).
- PGlite is single-process: stop the dev server before running scripts that write to the local database.

## Troubleshooting

- **"Jest worker encountered child process exceptions"** in development: make sure no `instrumentation.ts` opens the embedded database (it would open it twice). It was removed for this reason.
- **Soil step failed (urban or water area)**: SoilGrids does not map built-up areas; draw the field on farmland.
- **Field page shows an amber banner**: a source failed during refresh; saved values are shown and Data Health has the error.
- **Port 3000 busy**: `npx next dev -p 3001`.

## Credits

Weather data by Open-Meteo.com (CC BY 4.0); ERA5: Copernicus Climate Change Service. SoilGrids v2.0, ISRIC (CC BY 4.0). Contains modified Copernicus Sentinel-2 data. CEDA Agri Market Data, Ashoka University (source: Agmarknet). India Post pincode directory. Map © OpenStreetMap contributors.
