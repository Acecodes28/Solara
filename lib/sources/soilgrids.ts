import { z } from 'zod';
import { fetchJson, request, SourceError } from './http';
import { SOURCE } from '../config/sources';

export interface SoilValues {
  sandPct: number;
  clayPct: number;
  socPct: number;
  via: 'REST' | 'WCS';
}

/** 0-30 cm as a thickness-weighted mean of the 0-5, 5-15 and 15-30 cm layers. */
const DEPTHS = [
  { label: '0-5cm', w: 5 },
  { label: '5-15cm', w: 10 },
  { label: '15-30cm', w: 15 },
];

// SoilGrids mapped units: sand/clay g/kg (÷10 → %), soc dg/kg (÷100 → %).
const TO_PCT: Record<string, number> = { sand: 10, clay: 10, soc: 100 };

const RestSchema = z.object({
  properties: z.object({
    layers: z.array(z.object({
      name: z.string(),
      depths: z.array(z.object({ label: z.string(), values: z.object({ mean: z.number().nullable() }) })),
    })),
  }),
});

async function viaRest(lat: number, lon: number): Promise<SoilValues> {
  const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon.toFixed(5)}&lat=${lat.toFixed(5)}&property=sand&property=clay&property=soc&${DEPTHS.map((d) => `depth=${d.label}`).join('&')}&value=mean`;
  const j = await fetchJson(url, RestSchema, { source: SOURCE.soil, timeoutMs: 20_000 });
  const out: Record<string, number> = {};
  for (const prop of ['sand', 'clay', 'soc']) {
    const layer = j.properties.layers.find((l) => l.name === prop);
    if (!layer) throw new SourceError(SOURCE.soil, `No ${prop} layer at this location`);
    let s = 0, w = 0;
    for (const d of DEPTHS) {
      const v = layer.depths.find((x) => x.label === d.label)?.values.mean;
      if (v == null) continue;
      s += (v / TO_PCT[prop]) * d.w;
      w += d.w;
    }
    if (w === 0) throw new SourceError(SOURCE.soil, `No ${prop} values at this location`);
    out[prop] = s / w;
  }
  return { sandPct: out.sand, clayPct: out.clay, socPct: out.soc, via: 'REST' };
}

/** Same SoilGrids v2.0 maps via the ISRIC WCS service; median of valid pixels in a ~2.5 km window. */
async function wcsValue(prop: string, depth: string, lat: number, lon: number): Promise<number | null> {
  const { fromArrayBuffer } = await import('geotiff');
  for (const half of [0.0125, 0.03]) {
    const bbox = [lon - half, lat - half, lon + half, lat + half].map((v) => v.toFixed(5)).join(',');
    const url = `https://maps.isric.org/mapserv?map=/map/${prop}.map&SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=${prop}_${depth}_mean&FORMAT=GEOTIFF_INT16&CRS=EPSG:4326&BBOX=${bbox}&RESX=0.0025&RESY=0.0025`;
    const res = await request(url, { source: SOURCE.soil, timeoutMs: 20_000, headers: { Accept: 'image/tiff' } });
    if (!(res.headers.get('content-type') ?? '').includes('tiff')) throw new SourceError(SOURCE.soil, 'WCS did not return a GeoTIFF');
    const tiff = await fromArrayBuffer(await res.arrayBuffer());
    const img = await tiff.getImage();
    const raster = (await img.readRasters())[0] as unknown as ArrayLike<number>;
    const vals = Array.from(raster).filter((v) => v > 0 && v < 32767).sort((a, b) => a - b);
    if (vals.length >= 3) return vals[Math.floor(vals.length / 2)];
  }
  return null;
}

async function viaWcs(lat: number, lon: number): Promise<SoilValues> {
  const out: Record<string, number> = {};
  for (const prop of ['sand', 'clay', 'soc']) {
    let s = 0, w = 0;
    for (const d of DEPTHS) {
      const v = await wcsValue(prop, d.label, lat, lon);
      if (v == null) continue;
      s += (v / TO_PCT[prop]) * d.w;
      w += d.w;
    }
    if (w === 0) throw new SourceError(SOURCE.soil, `No ${prop} values mapped near this location (urban or water area)`);
    out[prop] = s / w;
  }
  return { sandPct: out.sand, clayPct: out.clay, socPct: out.soc, via: 'WCS' };
}

export async function fetchSoil(lat: number, lon: number): Promise<SoilValues> {
  try {
    return await viaRest(lat, lon);
  } catch (restErr) {
    try {
      return await viaWcs(lat, lon);
    } catch (wcsErr) {
      const a = restErr instanceof Error ? restErr.message : String(restErr);
      const b = wcsErr instanceof Error ? wcsErr.message : String(wcsErr);
      throw new SourceError(SOURCE.soil, `REST: ${a}; WCS: ${b}`);
    }
  }
}
