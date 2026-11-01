'use client';

import { PageHeader } from '@/components/AppShell';
import { Card } from '@/components/ui';
import { useApp } from '@/lib/i18n/context';
import { CROPS } from '@/lib/config/crops';
import { THRESHOLDS } from '@/lib/config/thresholds';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Card as="section" id={id} className="scroll-mt-4">
      <h2 className="mb-2 text-lg font-semibold text-primary">{title}</h2>
      <div className="space-y-2 text-[15px] leading-relaxed [&_code]:rounded [&_code]:bg-page [&_code]:px-1 [&_code]:text-sm">{children}</div>
    </Card>
  );
}

const F = ({ children }: { children: React.ReactNode }) => <pre className="overflow-x-auto rounded-ctl bg-page px-3 py-2 text-[13px] leading-relaxed">{children}</pre>;

export default function MethodologyPage() {
  const { t } = useApp();
  const w = CROPS.Wheat, s = CROPS.Soybean;
  const toc = [['ingest', 'Data and ingestion'], ['soil', 'Plant-available water'], ['crop', 'Crop parameters'], ['balance', 'Water balance'], ['decision', 'Irrigation decision'], ['analog', 'Season stress chance'], ['outlook', 'Outlooks'], ['alerts', 'Protective alerts'], ['satellite', 'Satellite check'], ['market', 'Sell or hold'], ['harvest', 'Harvest timing'], ['backtest', 'Backtest'], ['ai', 'Solara AI and verification'], ['stale', 'Staleness']];
  return (
    <div className="animate-fadeUp">
      <PageHeader title={t('methodology_title')} subtitle={t('methodology_sub')} />
      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Sections">
        {toc.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium hover:border-primary hover:text-primary">{label}</a>)}
      </nav>
      <div className="space-y-4">
        <Section id="ingest" title="1. Data and ingestion">
          <p>For each field Solara fetches and stores, with source and fetch time on every row:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Daily weather 2005 to today − 7 days</strong>: Open-Meteo historical archive (ERA5 reanalysis): precipitation, maximum and minimum temperature and FAO-56 reference evapotranspiration (ET0).</li>
            <li><strong>Past 30 days and next 16 days</strong>: Open-Meteo forecast API.</li>
            <li><strong>Soil</strong>: SoilGrids v2.0 (ISRIC) sand, clay and soil organic carbon, 0–5, 5–15 and 15–30 cm, combined as a thickness-weighted mean for 0–30 cm. The REST API is tried first; when it is unavailable the same SoilGrids maps are read through ISRIC’s WCS service (median of mapped pixels within about 1.4 km).</li>
            <li><strong>Satellite</strong>: Sentinel-2 L2A NDVI statistics over the field polygon from 2017 (Copernicus Data Space Statistics API), scene cloud cover ≤ 40%, pixels masked by scene classification; a day is clear when ≥ 60% of pixels are clear.</li>
            <li><strong>Ensembles</strong>: ECMWF IFS 0.25° (51 members, 8 days) and ECMWF SEAS5 (51 members, 45 days) via Open-Meteo.</li>
            <li><strong>Prices</strong>: CEDA Agri Market Data monthly modal prices (source: Agmarknet), by API key or imported CSV. Daily rows are reduced to the monthly median.</li>
          </ul>
          <p>Steps run independently; a failed step is recorded on Data Health and does not stop the others. Missing values stay missing (null): Solara never fills a gap with a guess.</p>
        </Section>

        <Section id="soil" title="2. Plant-available water (Saxton & Rawls 2006)">
          <p>S = sand fraction, C = clay fraction, OM = organic matter % = SOC % × 1.724.</p>
          <F>{`t1500 = −0.024·S + 0.487·C + 0.006·OM + 0.005·S·OM − 0.013·C·OM + 0.068·S·C + 0.031
θ1500 = t1500 + (0.14·t1500 − 0.02)
t33   = −0.251·S + 0.195·C + 0.011·OM + 0.006·S·OM − 0.027·C·OM + 0.452·S·C + 0.299
θ33   = t33 + (1.283·t33² − 0.374·t33 − 0.015)
AWC (mm/m) = (θ33 − θ1500) × 1000, clamped to 40–250`}</F>
          <p>Check: S 0.40, C 0.20, OM 1.5% gives 137.8 mm/m.</p>
        </Section>

        <Section id="crop" title="3. Crop parameters and growth stage">
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Parameter</th><th>Wheat</th><th>Soybean</th></tr></thead>
              <tbody>
                <tr><td>Stage lengths (initial / development / mid / late), days</td><td>{w.stageLengths.join(' / ')}</td><td>{s.stageLengths.join(' / ')}</td></tr>
                <tr><td>Kc initial / mid / end</td><td>{w.kcIni} / {w.kcMid} / {w.kcEnd}</td><td>{s.kcIni} / {s.kcMid} / {s.kcEnd}</td></tr>
                <tr><td>Root depth</td><td>{w.rootDepthM} m</td><td>{s.rootDepthM} m</td></tr>
                <tr><td>Depletion fraction p</td><td>{w.p}</td><td>{s.p}</td></tr>
                <tr><td>Base temperature (GDD)</td><td>{w.baseTempC} °C</td><td>{s.baseTempC} °C</td></tr>
                <tr><td>Season length</td><td>{w.stageLengths.reduce((a, b) => a + b)} days</td><td>{s.stageLengths.reduce((a, b) => a + b)} days</td></tr>
              </tbody>
            </table>
          </div>
          <p>Kc, root depth and p follow FAO Irrigation and Drainage Paper No. 56, Tables 12 and 22. Stage lengths are the FAO-56 Table 11 values for these crops. Season totals (wheat 125 days, soybean 105 days) are consistent with Madhya Pradesh durations: timely-sown wheat in the Central Zone takes roughly 120–130 days from sowing to maturity (ICAR-Indian Institute of Wheat and Barley Research), and the JS-series soybean varieties widely grown in Madhya Pradesh mature in roughly 90–105 days (ICAR-Indian Institute of Soybean Research, Indore). Varieties differ; long-duration varieties will reach the late stage later than shown.</p>
          <p>Day of season d = date − sowing date (from 0). Kc is constant in the initial and mid stages and interpolates linearly through development (Kc ini → Kc mid) and late (Kc mid → Kc end). Growing degree days = Σ max(0, (Tmax + Tmin)/2 − base).</p>
        </Section>

        <Section id="balance" title="4. Daily root-zone water balance (FAO-56)">
          <F>{`TAW = AWC × root depth        RAW = p × TAW
ETc = Kc × ET0
Ks  = 1                                   if D(prev) ≤ RAW
    = (TAW − D(prev)) / ((1 − p) × TAW)   otherwise
D   = clamp(D(prev) − P − I + Ks × ETc, 0, TAW)`}</F>
          <p>D is depletion below field capacity (mm), P precipitation, I logged irrigation. Day 0 depletion is 0. Water above field capacity drains. A day with missing rain or ET0 is a <em>gap</em>: depletion is carried forward and the gap count is shown on the Water tab.</p>
        </Section>

        <Section id="decision" title="5. Irrigation decision">
          <ul className="list-disc space-y-1 pl-5">
            <li>If today’s depletion ≥ RAW: <strong>Irrigate now</strong>, amount = today’s depletion (refill to field capacity).</li>
            <li>Else the first day k (1–7) whose probability of needing irrigation by day k is ≥ {THRESHOLDS.irrigateSoonProb * 100}%: <strong>Irrigate within k days</strong>.</li>
            <li>Otherwise: <strong>No irrigation needed for 7 days</strong>.</li>
          </ul>
        </Section>

        <Section id="analog" title="6. Season stress chance (analog model, fitted per field)">
          <p>For every past season since 2005 with complete archive weather (the field’s own season excluded), the balance is run from the same calendar sowing date. Its outcome is the number of mid-stage days with Ks &lt; 1; the season is <em>stressed</em> when that count is ≥ {THRESHOLDS.stressDaysFlag}.</p>
          <p>Each past season’s state on today’s day of season (depletion ÷ TAW, stress days so far) is compared with this season’s:</p>
          <F>{`w = exp(−[((Δ depletion ratio) / ${THRESHOLDS.analogDepletionScale})² + ((Δ stress days) / ${THRESHOLDS.analogStressScale})²] / 2)
P(stress) = (Σ w·flag + 1) / (Σ w + 2)`}</F>
          <p>Needs at least {THRESHOLDS.minAnalogSeasons} past seasons. Validation is leave-one-season-out: Brier = mean (p − outcome)²; baseline = Brier of always predicting the share of stressed seasons; skill = 1 − Brier ÷ baseline. Skill is shown even when it is negative.</p>
        </Section>

        <Section id="outlook" title="7. Seven-day and six-week outlooks">
          <p><strong>7 days</strong>: for each of 51 ensemble members the balance is run forward from today’s depletion with that member’s rain and ET0. P(irrigation by day k) = share of members whose depletion reaches RAW on any day up to k. Members with missing values are excluded and counted.</p>
          <p><strong>Weeks 2–6</strong>: each SEAS5 member’s weekly rain total is compared with the normal (mean ERA5 total for the same calendar dates in past years). P = share of members below half of normal.</p>
        </Section>

        <Section id="alerts" title="8. Protective alerts (next three days)">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Frost</strong>: forecast minimum ≤ {THRESHOLDS.frostTminC} °C, or ≥ 50% of ensemble members ≤ {THRESHOLDS.frostTminC} °C. Irrigate before the frost night if depletion ≥ {THRESHOLDS.frostIrrigateDepletionMm} mm; cover seedlings in the initial stage.</li>
            <li><strong>Heavy rain</strong>: forecast daily rain ≥ {THRESHOLDS.heavyRainMm} mm (IMD “heavy” lower bound). Check drainage; delay top-dressing by three days.</li>
            <li><strong>Heatwave</strong>: forecast maximum ≥ {THRESHOLDS.heatwaveTmaxC} °C. Irrigate early morning if depletion ≥ 0.5 × RAW; avoid spraying 11:00–16:00.</li>
          </ul>
        </Section>

        <Section id="satellite" title="9. Satellite agreement">
          <p>The latest clear NDVI is compared with the 25th–75th percentile band of past seasons on the same day of season (nearest clear value within ±5 days, at least 3 seasons). Verdicts: <em>agrees: vegetation below normal</em> (stress chance ≥ 50%, below band); <em>does not yet show stress</em> (≥ 50%, within band); <em>shows stress the weather model does not explain</em> (&lt; 50%, below band); <em>agree: no stress</em> otherwise. No verdict without a clear image in 21 days.</p>
        </Section>

        <Section id="market" title="10. Sell or hold">
          <F>{`Percentile = share of past years whose price for this month is below P0
R = price(month + h) / price(month)   for each past year, h ∈ {1, 2, 3}
G = P0 × (R − 1) − h × storage − P0 × interest × h / 12
Expected gain = mean G;  hit rate = share of years with G > 0`}</F>
          <p>Hold when some h has expected gain &gt; 0 and hit rate ≥ {THRESHOLDS.holdHitRate * 100}%; otherwise Sell. Needs ≥ {THRESHOLDS.minPriceYears} years for the mandi and month. Quantity = area × expected yield (default 20 q/ha wheat, 10 q/ha soybean, labelled as assumptions; storage ₹25/q/month and interest 9%/year by default). A data.gov.in live reading, when configured, is shown separately and never used in the recommendation.</p>
        </Section>

        <Section id="harvest" title="11. Harvest timing">
          <p>Eight candidate weeks start at day {w.harvestStartDay} after sowing for wheat and day {s.harvestStartDay} for soybean. For each past year: rain days = days ≥ 1 mm in the week; price = modal price of the month containing the week. Loss = min(0.30, 0.03 × rain days) is <strong>an assumption, modelled not measured</strong>. Net value = price × (1 − loss).</p>
        </Section>

        <Section id="backtest" title="12. Backtest">
          <p>Stress: the leave-one-season-out predictions with Brier, baseline and skill. Price: for each past year, the sell-or-hold advice using only earlier years on the first day of the sell window (April for wheat, October for soybean), compared with selling in that month; reported in rupees per field.</p>
        </Section>

        <Section id="ai" title="13. Solara AI and number verification">
          <p>All arithmetic runs in code. Solara AI (Google Gemini, temperature 0, when configured) only words advice from a fact sheet in which every value has an ID, label, unit, source and fetch time. A verifier then checks every number in the text against the facts: within 0.5 mm, 0.5 percentage points, 0.5 °C or ₹1 (dates and day counts are exempt). If any number fails, the model text is discarded and fixed templates are used. Without a key, templates are always used and the card says “Standard wording”. The chat answers only from the field’s facts and refuses anything else.</p>
        </Section>

        <Section id="stale" title="14. Staleness">
          <p>Age = now − fetch time. Stale after: weather 24 hours, satellite 7 days, prices 60 days, soil 365 days. Stale values still display with a badge and their age.</p>
        </Section>
        <p className="text-center text-xs text-muted">Weather data by Open-Meteo.com (CC BY 4.0). ERA5: Copernicus Climate Change Service (C3S). Soil: SoilGrids v2.0, ISRIC. Satellite: modified Copernicus Sentinel-2 data. Prices: CEDA, Ashoka University (Agmarknet). Map: © OpenStreetMap contributors.</p>
      </div>
    </div>
  );
}
