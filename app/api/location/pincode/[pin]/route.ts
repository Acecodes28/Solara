import { error, handle, json } from '@/lib/api';
import { lookupPincode } from '@/lib/sources/indiaPost';
import { tracked } from '@/lib/sources/status';
import { geocode } from '@/lib/sources/openMeteo';
import { SOURCE } from '@/lib/config/sources';
import { MSG } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async (_req: Request, { params }: { params: { pin: string } }) => {
  if (!/^\d{6}$/.test(params.pin)) return error('Pincode must be exactly 6 digits.', 422, { field: 'pincode' });
  const r = await tracked(SOURCE.indiaPost, () => lookupPincode(params.pin)).catch(() => undefined);
  if (r === undefined) return error('Pincode lookup is unavailable right now. Try district search.', 502);
  if (!r) return error(MSG.pincodeNotFound, 404, { field: 'pincode' });
  // Turn the district into a point with the geocoder.
  const hits = await geocode(r.district).catch(() => []);
  const hit = hits.find((h) => h.state?.toLowerCase() === r.state.toLowerCase()) ?? hits[0] ?? null;
  return json({
    pincode: params.pin,
    district: r.district,
    state: r.state,
    offices: r.offices,
    point: hit ? { lat: Math.round(hit.lat * 1e4) / 1e4, lon: Math.round(hit.lon * 1e4) / 1e4, name: hit.name } : null,
    source: 'India Post (api.postalpincode.in); point from Open-Meteo geocoding',
  });
});
