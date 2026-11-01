import { z } from 'zod';
import { fetchJson, SourceError } from './http';
import { SOURCE } from '../config/sources';

const TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const STATS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/statistics';

let cached: { token: string; exp: number } | null = null;

export const copernicusConfigured = () => !!process.env.COPERNICUS_CLIENT_ID && !!process.env.COPERNICUS_CLIENT_SECRET;

async function token(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.COPERNICUS_CLIENT_ID ?? '',
    client_secret: process.env.COPERNICUS_CLIENT_SECRET ?? '',
  });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal });
  } catch {
    throw new SourceError(SOURCE.copernicus, 'Could not reach the Copernicus identity service');
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) throw new SourceError(SOURCE.copernicus, `Credentials rejected (HTTP ${res.status})`, res.status);
  const j = z.object({ access_token: z.string(), expires_in: z.number() }).parse(await res.json());
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

// NDVI with a scene-classification mask: only vegetation, bare soil, water and unclassified pixels count as clear.
const EVALSCRIPT = `//VERSION=3
function setup() {
  return { input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [{ id: "ndvi", bands: 1, sampleType: "FLOAT32" }, { id: "dataMask", bands: 1 }] };
}
function evaluatePixel(s) {
  var clear = (s.SCL == 4 || s.SCL == 5 || s.SCL == 6 || s.SCL == 7) ? 1 : 0;
  var ndvi = (s.B08 + s.B04) == 0 ? 0 : (s.B08 - s.B04) / (s.B08 + s.B04);
  return { ndvi: [ndvi], dataMask: [s.dataMask * clear] };
}`;

const StatsSchema = z.object({
  data: z.array(z.object({
    interval: z.object({ from: z.string(), to: z.string() }),
    outputs: z.object({
      ndvi: z.object({
        bands: z.object({
          B0: z.object({
            stats: z.object({ mean: z.union([z.number(), z.string()]).nullable().optional(), sampleCount: z.number(), noDataCount: z.number() }),
          }),
        }),
      }),
    }).optional(),
    error: z.unknown().optional(),
  })),
});

export interface NdviObs { date: string; ndvi: number | null; cloudFree: boolean }

/** Daily NDVI statistics over the polygon for [from, to]. A day is cloud-free when at least 60% of pixels are clear. */
export async function fetchNdvi(polygon: GeoJSON.Polygon, from: string, to: string): Promise<NdviObs[]> {
  if (!copernicusConfigured()) throw new SourceError(SOURCE.copernicus, 'Satellite not configured');
  const body = {
    input: {
      bounds: { geometry: polygon, properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' } },
      data: [{ type: 'sentinel-2-l2a', dataFilter: { maxCloudCoverage: 40 } }],
    },
    aggregation: {
      timeRange: { from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` },
      aggregationInterval: { of: 'P1D' },
      evalscript: EVALSCRIPT,
      resx: 0.0001,
      resy: 0.0001,
    },
    calculations: { default: {} },
  };
  const j = await fetchJson(STATS_URL, StatsSchema, {
    source: SOURCE.copernicus, method: 'POST', body, timeoutMs: 60_000, retry: false,
    headers: { Authorization: `Bearer ${await token()}` },
  });
  return j.data.map((d) => {
    const s = d.outputs?.ndvi.bands.B0.stats;
    const date = d.interval.from.slice(0, 10);
    if (!s || s.sampleCount === 0) return { date, ndvi: null, cloudFree: false };
    const clearShare = 1 - s.noDataCount / s.sampleCount;
    const mean = typeof s.mean === 'number' ? s.mean : null;
    const cloudFree = clearShare >= 0.6 && mean != null;
    return { date, ndvi: cloudFree ? mean : null, cloudFree };
  });
}

/** A ~60 m square around a point, for fields saved as a single point. */
export function pointSquare(lat: number, lon: number): GeoJSON.Polygon {
  const dLat = 0.00027, dLon = 0.00027 / Math.cos((lat * Math.PI) / 180);
  return { type: 'Polygon', coordinates: [[[lon - dLon, lat - dLat], [lon + dLon, lat - dLat], [lon + dLon, lat + dLat], [lon - dLon, lat + dLat], [lon - dLon, lat - dLat]]] };
}
