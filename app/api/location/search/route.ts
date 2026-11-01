import { error, handle, json } from '@/lib/api';
import { geocode } from '@/lib/sources/openMeteo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async (req: Request) => {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q.length < 2 || q.length > 60) return error('Search must be 2 to 60 characters.', 422, { field: 'q' });
  const results = await geocode(q).catch(() => null);
  if (!results) return error('Location search is unavailable right now.', 502);
  return json({
    results: results.map((r) => ({ ...r, lat: Math.round(r.lat * 1e4) / 1e4, lon: Math.round(r.lon * 1e4) / 1e4 })),
    source: 'Open-Meteo geocoding (GeoNames)',
  });
});
