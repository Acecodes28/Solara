import { z } from 'zod';
import area from '@turf/area';
import centroid from '@turf/centroid';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import pointOnFeature from '@turf/point-on-feature';
import { INDIA_BOUNDS, HISTORY_START } from './config/thresholds';
import { isIsoDate, todayIst } from './engine/dates';

export const MSG = {
  name: 'Name must be 1 to 60 characters.',
  noLocation: 'Draw the field or enter a location.',
  both: 'Give either a polygon or a point, not both.',
  outside: 'This app covers India only.',
  sowing: 'Sowing date must be between 2005-01-01 and today.',
  pincodeNotFound: 'Pincode not found. Try district search.',
  question: 'Keep questions under 300 characters.',
  notFound: 'Field not found.',
  conflict: 'Ingestion already running for this field.',
  unauthorised: 'Not authorised.',
};

const Position = z.tuple([z.number().finite(), z.number().finite()]).rest(z.number());
export const PolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(Position)).min(1),
}).strict();

export const PointSchema = z.object({ lat: z.number().finite(), lon: z.number().finite() }).strict();

const optionalNum = (min: number, max: number, label: string) =>
  z.number({ invalid_type_error: `${label} must be a number.` }).min(min, `${label} must be between ${min} and ${max}.`).max(max, `${label} must be between ${min} and ${max}.`).nullable().optional();

export const FieldCreateSchema = z.object({
  name: z.string(),
  crop: z.enum(['Wheat', 'Soybean'], { errorMap: () => ({ message: 'Crop must be Wheat or Soybean.' }) }),
  sowingDate: z.string(),
  polygon: PolygonSchema.nullable().optional(),
  point: PointSchema.nullable().optional(),
  areaHa: optionalNum(0.05, 500, 'Area'),
  mandi: z.string().max(80).nullable().optional(),
  expectedYieldQPerHa: optionalNum(1, 60, 'Expected yield'),
  storageCostPerQMonth: optionalNum(0, 200, 'Storage cost'),
  interestPctYear: optionalNum(0, 30, 'Interest rate'),
}).strict();

export const FieldPatchSchema = z.object({
  name: z.string().optional(),
  crop: z.enum(['Wheat', 'Soybean']).optional(),
  sowingDate: z.string().optional(),
  mandi: z.string().max(80).nullable().optional(),
  expectedYieldQPerHa: optionalNum(1, 60, 'Expected yield'),
  storageCostPerQMonth: optionalNum(0, 200, 'Storage cost'),
  interestPctYear: optionalNum(0, 30, 'Interest rate'),
}).strict();

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

export function checkName(name: string): string {
  const n = name.trim();
  if (n.length < 1 || n.length > 60) throw new ValidationError(MSG.name, 'name');
  return n;
}

export function checkSowing(d: string): string {
  if (!isIsoDate(d) || d < HISTORY_START || d > todayIst()) throw new ValidationError(MSG.sowing, 'sowingDate');
  return d;
}

export const inIndia = (lat: number, lon: number) =>
  lat >= INDIA_BOUNDS.minLat && lat <= INDIA_BOUNDS.maxLat && lon >= INDIA_BOUNDS.minLon && lon <= INDIA_BOUNDS.maxLon;

export interface Geometry {
  polygon: GeoJSON.Polygon | null;
  centroidLat: number;
  centroidLon: number;
  areaHa: number;
}

/** Validates the location (E2-E4) and computes geodesic area and an interior centroid. */
export function checkGeometry(polygon: GeoJSON.Polygon | null | undefined, point: { lat: number; lon: number } | null | undefined, pointAreaHa?: number | null): Geometry {
  if (!polygon && !point) throw new ValidationError(MSG.noLocation, 'location');
  if (polygon && point) throw new ValidationError(MSG.both, 'location');
  if (point) {
    if (!inIndia(point.lat, point.lon)) throw new ValidationError(MSG.outside, 'location');
    if (pointAreaHa == null) throw new ValidationError('Enter the field area in hectares for a point location.', 'areaHa');
    return { polygon: null, centroidLat: point.lat, centroidLon: point.lon, areaHa: pointAreaHa };
  }
  const ring = [...polygon!.coordinates[0]];
  const first = ring[0], last = ring[ring.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1];
  const vertices = closed ? ring.length - 1 : ring.length;
  if (vertices < 3 || vertices > 2000) throw new ValidationError('A field polygon needs 3 to 2000 corners.', 'location');
  if (!closed) ring.push(first);
  if (ring.some(([lon, lat]) => !inIndia(lat, lon))) throw new ValidationError(MSG.outside, 'location');
  const poly: GeoJSON.Polygon = { type: 'Polygon', coordinates: [ring.map(([lon, lat]) => [lon, lat])] };
  const feature: GeoJSON.Feature<GeoJSON.Polygon> = { type: 'Feature', properties: {}, geometry: poly };
  const ha = area(feature) / 10_000;
  if (ha < 0.05 || ha > 500) throw new ValidationError(`Field area must be 0.05 to 500 hectares (drawn: ${ha.toFixed(2)} ha).`, 'location');
  let c = centroid(feature).geometry.coordinates;
  if (!booleanPointInPolygon(c, feature)) c = pointOnFeature(feature).geometry.coordinates;
  return { polygon: poly, centroidLat: c[1], centroidLon: c[0], areaHa: ha };
}

export const BrowserKeySchema = z.string().regex(/^[a-f0-9]{32}$/);

export const AdvisorSchema = z.object({
  fieldId: z.string().uuid(),
  question: z.string(),
}).strict();

export const TelegramLinkSchema = z.object({
  fieldId: z.string().uuid(),
  chatId: z.union([z.number().int(), z.string().regex(/^-?\d{1,20}$/)]).transform((v) => Number(v)),
}).strict();

export const IngestSchema = z.object({ kinds: z.array(z.enum(['history', 'soil', 'ndvi', 'prices'])).min(1).optional() }).strict();
