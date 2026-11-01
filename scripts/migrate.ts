/** Applies the SQL migrations in drizzle/ (the app also does this on first database use). */
import { loadEnv } from './env';

async function main() {
  loadEnv();
  const { getHandle } = await import('../lib/db/client');
  const h = await getHandle();
  const rows = await h.query('SELECT name, applied_at FROM "_solara_migrations" ORDER BY name');
  for (const r of rows) console.log(`applied ${r.name}`);
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
