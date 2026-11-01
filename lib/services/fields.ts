import { desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import { advice, alertLinks, fieldResults, fields, type Field } from '../db/schema';
import { CROPS, type Crop } from '../config/crops';
import { DEFAULT_INTEREST_PCT, DEFAULT_STORAGE_COST } from '../config/thresholds';
import { checkGeometry, checkName, checkSowing, FieldCreateSchema, FieldPatchSchema } from '../validation';
import type { z } from 'zod';
import type { FieldSummary } from './types';
import { latestJobs } from './ingest';

/** Coordinates leave the server at four decimals (~11 m). */
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function publicField(f: Field) {
  return {
    id: f.id,
    name: f.name,
    crop: f.crop as Crop,
    sowingDate: f.sowingDate,
    centroid: { lat: r4(f.centroidLat), lon: r4(f.centroidLon) },
    polygon: f.polygon
      ? { type: 'Polygon', coordinates: (f.polygon as GeoJSON.Polygon).coordinates.map((ring) => ring.map(([lon, lat]) => [r4(lon), r4(lat)])) }
      : null,
    areaHa: f.areaHa,
    mandi: f.mandi,
    expectedYieldQPerHa: f.expectedYieldQPerHa,
    defaultYieldQPerHa: CROPS[f.crop as Crop].defaultYieldQPerHa,
    storageCostPerQMonth: f.storageCostPerQMonth,
    interestPctYear: f.interestPctYear,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

export async function createField(browserKey: string, input: z.infer<typeof FieldCreateSchema>) {
  const name = checkName(input.name);
  const geo = checkGeometry(input.polygon, input.point, input.areaHa);
  const sowingDate = checkSowing(input.sowingDate);
  const db = await getDb();
  const [f] = await db.insert(fields).values({
    browserKey,
    name,
    crop: input.crop,
    sowingDate,
    centroidLat: geo.centroidLat,
    centroidLon: geo.centroidLon,
    polygon: geo.polygon,
    areaHa: Math.round(geo.areaHa * 1000) / 1000,
    mandi: input.mandi?.trim() || null,
    expectedYieldQPerHa: input.expectedYieldQPerHa ?? null,
    storageCostPerQMonth: input.storageCostPerQMonth ?? DEFAULT_STORAGE_COST,
    interestPctYear: input.interestPctYear ?? DEFAULT_INTEREST_PCT,
  }).returning();
  return f;
}

export async function patchField(f: Field, input: z.infer<typeof FieldPatchSchema>) {
  const set: Partial<typeof fields.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) set.name = checkName(input.name);
  if (input.crop !== undefined) set.crop = input.crop;
  if (input.sowingDate !== undefined) set.sowingDate = checkSowing(input.sowingDate);
  if (input.mandi !== undefined) set.mandi = input.mandi?.trim() || null;
  if (input.expectedYieldQPerHa !== undefined) set.expectedYieldQPerHa = input.expectedYieldQPerHa;
  if (input.storageCostPerQMonth !== undefined) set.storageCostPerQMonth = input.storageCostPerQMonth ?? DEFAULT_STORAGE_COST;
  if (input.interestPctYear !== undefined) set.interestPctYear = input.interestPctYear ?? DEFAULT_INTEREST_PCT;
  const db = await getDb();
  const [u] = await db.update(fields).set(set).where(eq(fields.id, f.id)).returning();
  return u;
}

export async function deleteField(id: string) {
  const db = await getDb();
  await db.delete(alertLinks).where(eq(alertLinks.fieldId, id));
  await db.delete(fields).where(eq(fields.id, id));
}

export async function listFields(browserKey: string) {
  const db = await getDb();
  const rows = await db.select().from(fields).where(eq(fields.browserKey, browserKey)).orderBy(desc(fields.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const results = await db.select().from(fieldResults).where(inArray(fieldResults.fieldId, ids));
  const out = [];
  for (const f of rows) {
    const s = results.find((r) => r.fieldId === f.id)?.summary as FieldSummary | undefined;
    const jobs = await latestJobs(f.id);
    out.push({
      ...publicField(f),
      summary: s ? {
        asOf: s.asOf,
        stage: s.stage,
        dayOfSeason: s.dayOfSeason,
        seasonComplete: s.seasonComplete,
        decision: s.decision,
        depletion: s.today?.depletion ?? null,
        raw: s.raw,
        stressProb: s.risk.status === 'ok' ? s.risk.prob : null,
        riskStatus: s.risk.status,
        seasonsUsed: s.risk.n,
        alertsToday: s.alerts.map((a) => a.type),
        computedAt: s.computedAt,
        errors: s.errors,
      } : null,
      ingesting: jobs.some((j) => j.status === 'queued' || j.status === 'running'),
    });
  }
  return out.sort((a, b) => (b.summary?.stressProb ?? -1) - (a.summary?.stressProb ?? -1));
}

export async function latestAdvice(fieldId: string) {
  const db = await getDb();
  const [a] = await db.select().from(advice).where(eq(advice.fieldId, fieldId)).orderBy(desc(advice.date)).limit(1);
  return a ?? null;
}
