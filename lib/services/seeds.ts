import { getDb } from '../db/client';
import { seedLocations } from '../db/schema';
import { SEED_LOCATION_NAMES } from '../config/seeds';
import { geocode } from '../sources/openMeteo';

/** Geocodes the Madhya Pradesh seed locations once and stores them with their source and fetch time. */
export async function ensureSeeds() {
  const db = await getDb();
  const existing = await db.select().from(seedLocations);
  const missing = SEED_LOCATION_NAMES.filter((n) => !existing.some((e) => e.name === n));
  for (const name of missing) {
    try {
      const hits = await geocode(name, 5);
      const hit = hits.find((h) => h.state === 'Madhya Pradesh') ?? null;
      if (!hit) continue;
      await db.insert(seedLocations).values({
        name, lat: hit.lat, lon: hit.lon, district: hit.district, state: hit.state, source: 'Open-Meteo geocoding (GeoNames)', fetchedAt: new Date(),
      }).onConflictDoNothing();
    } catch {
      // Network unavailable: try again on the next start or request.
    }
  }
  return db.select().from(seedLocations);
}
