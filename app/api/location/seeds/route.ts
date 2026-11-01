import { handle, json } from '@/lib/api';
import { ensureSeeds } from '@/lib/services/seeds';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async () => {
  const rows = await ensureSeeds();
  return json({ seeds: rows.map((r) => ({ name: r.name, lat: Math.round(r.lat * 1e4) / 1e4, lon: Math.round(r.lon * 1e4) / 1e4, district: r.district, source: r.source, fetchedAt: r.fetchedAt.toISOString() })) });
});
