import { test, expect, type APIRequestContext } from '@playwright/test';
import crypto from 'crypto';

const key = crypto.randomBytes(16).toString('hex');
const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const created: string[] = [];

test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/fields/${id}`, { headers: { 'x-browser-key': key } });
});

const daysAgo = (n: number) => new Date(Date.now() + 330 * 60_000 - n * 86_400_000).toISOString().slice(0, 10);

async function createField(request: APIRequestContext, name: string, lon: number, lat: number, sowing: string) {
  const d = 0.004;
  const res = await request.post('/api/fields', {
    headers: { 'x-browser-key': key },
    data: { name, crop: 'Wheat', sowingDate: sowing, polygon: { type: 'Polygon', coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] } },
  });
  expect(res.status()).toBe(201);
  const field = (await res.json()).field;
  created.push(field.id);
  return field as { id: string; areaHa: number; centroid: { lat: number; lon: number } };
}

test('AC3: health lists every source with a valid state', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  const j = await res.json();
  expect(j.status).toBe('ok');
  const names = j.sources.map((s: { name: string }) => s.name);
  for (const n of ['Open-Meteo archive', 'Open-Meteo forecast', 'Open-Meteo ensemble', 'Open-Meteo weekly ensemble', 'SoilGrids', 'Copernicus', 'CEDA', 'data.gov.in', 'India Post', 'Telegram', 'Gemini']) expect(names).toContain(n);
  for (const s of j.sources) expect(['ok', 'stale', 'failed', 'not_configured']).toContain(s.state);
});

test('AC4/AC5: polygon field is created; a point outside India is rejected', async ({ request }) => {
  const f = await createField(request, 'E2E polygon', 75.85, 22.72, daysAgo(60));
  expect(f.areaHa).toBeGreaterThan(15);
  expect(f.centroid.lat).toBeGreaterThan(22.72);
  const bad = await request.post('/api/fields', { headers: { 'x-browser-key': key }, data: { name: 'x', crop: 'Wheat', sowingDate: today, point: { lat: 51.5, lon: -0.12 }, areaHa: 1 } });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error).toBe('This app covers India only.');
});

test('validation messages E1, E3, E5 and unknown fields', async ({ request }) => {
  const post = (data: object) => request.post('/api/fields', { headers: { 'x-browser-key': key }, data });
  const base = { crop: 'Wheat', sowingDate: today, point: { lat: 22.7, lon: 75.8 }, areaHa: 1 };
  expect((await (await post({ ...base, name: '' })).json()).error).toBe('Name must be 1 to 60 characters.');
  expect((await (await post({ ...base, name: 'a', sowingDate: '2004-12-31' })).json()).error).toBe('Sowing date must be between 2005-01-01 and today.');
  expect((await (await post({ ...base, name: 'a', polygon: { type: 'Polygon', coordinates: [[[75.8, 22.7], [75.81, 22.7], [75.81, 22.71], [75.8, 22.7]]] } })).json()).error).toBe('Give either a polygon or a point, not both.');
  expect((await post({ ...base, name: 'a', extra: 1 })).status()).toBe(422);
});

test('AC12: daily job needs the bearer secret', async ({ request }) => {
  expect((await request.get('/api/cron/daily')).status()).toBe(401);
  expect((await request.get('/api/cron/daily', { headers: { Authorization: 'Bearer wrong' } })).status()).toBe(401);
});

test('E21: unknown field returns 404', async ({ request }) => {
  const r = await request.get('/api/fields/00000000-0000-0000-0000-000000000000');
  expect(r.status()).toBe(404);
  expect((await r.json()).error).toBe('Field not found.');
});

test('AC15: switching field tabs does not reload the page', async ({ page, request }) => {
  const f = await createField(request, 'E2E tabs', 77.4, 23.25, daysAgo(40));
  await page.goto('/');
  await page.evaluate((k) => localStorage.setItem('solara.browserKey', k), key);
  await page.goto(`/fields/${f.id}`);
  await expect(page.getByTestId('tab-today')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __marker: number }).__marker = 7; });
  for (const t of ['water', 'risk', 'satellite', 'market', 'harvest', 'backtest', 'today']) {
    await page.getByTestId(`tab-${t}`).click();
    await expect(page.getByTestId(`tab-${t}`)).toHaveAttribute('aria-selected', 'true');
  }
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(7);
  expect(page.url()).toContain('tab=today');
});

test('AC14: pages render without horizontal scrolling at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  for (const p of ['/', '/dashboard', '/fields', '/fields/new', '/market', '/advisor', '/alerts', '/health', '/methodology', '/about']) {
    await page.goto(p);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${p}`).toBeLessThanOrEqual(0);
  }
});

test('S4: Solara AI refuses questions outside the field data', async ({ request }) => {
  const f = await createField(request, 'E2E advisor', 79.95, 23.17, daysAgo(30));
  const r = await request.post('/api/advisor', { data: { fieldId: f.id, question: 'Who will win the election?' } });
  expect(r.status()).toBe(200);
  const j = await r.json();
  expect(j.answer).toBe('I cannot answer that from the data for this field. Try asking about irrigation, frost, heat, rain, stress or price.');
  expect(j.facts).toEqual([]);
  const long = await request.post('/api/advisor', { data: { fieldId: f.id, question: 'a'.repeat(301) } });
  expect((await long.json()).error).toBe('Keep questions under 300 characters.');
});
