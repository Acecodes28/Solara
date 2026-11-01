/**
 * First-run setup: geocodes the four Madhya Pradesh seed locations (Indore, Bhopal, Jabalpur, Sehore)
 * with the real geocoding service and stores them. No hand-written records are created.
 */
import { loadEnv } from './env';

async function main() {
  loadEnv();
  const { ensureSeeds } = await import('../lib/services/seeds');
  const rows = await ensureSeeds();
  for (const r of rows) console.log(`${r.name}: ${r.lat.toFixed(4)}, ${r.lon.toFixed(4)} (${r.source}, fetched ${r.fetchedAt.toISOString()})`);
  if (rows.length < 4) console.warn('Some seed locations could not be geocoded (network?). Run again later.');
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
