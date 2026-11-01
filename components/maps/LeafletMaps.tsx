'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngExpression, LatLngBoundsExpression } from 'leaflet';

const TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const INDIA_CENTER: LatLngExpression = [22.9, 78.6];

export interface MapField {
  id: string;
  name: string;
  color: string;
  label: string;
  centroid: { lat: number; lon: number };
  polygon: { coordinates: number[][][] } | null;
}

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14, animate: true, duration: 0.2 });
  }, [bounds, map]);
  return null;
}

export function FieldsMap({ fields, onSelect, height = 340 }: { fields: MapField[]; onSelect?: (id: string) => void; height?: number }) {
  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (!fields.length) return null;
    const pts: [number, number][] = fields.flatMap((f) => (f.polygon ? f.polygon.coordinates[0].map(([lon, lat]) => [lat, lon] as [number, number]) : [[f.centroid.lat, f.centroid.lon] as [number, number]]));
    return pts as LatLngBoundsExpression;
  }, [fields]);
  return (
    <MapContainer center={INDIA_CENTER} zoom={5} style={{ height, width: '100%' }} scrollWheelZoom={false}>
      <TileLayer url={TILE} attribution={ATTR} />
      <FitBounds bounds={bounds} />
      {fields.map((f) => (
        <FieldShape key={f.id} f={f} onSelect={onSelect} />
      ))}
    </MapContainer>
  );
}

function FieldShape({ f, onSelect }: { f: MapField; onSelect?: (id: string) => void }) {
  const handlers = { click: () => onSelect?.(f.id) };
  const tip = <Tooltip direction="top" sticky><strong>{f.name}</strong><br />{f.label}</Tooltip>;
  return (
    <>
      {f.polygon && (
        <Polygon positions={f.polygon.coordinates[0].map(([lon, lat]) => [lat, lon] as [number, number])} pathOptions={{ color: f.color, weight: 2, fillOpacity: 0.35 }} eventHandlers={handlers}>
          {tip}
        </Polygon>
      )}
      <CircleMarker center={[f.centroid.lat, f.centroid.lon]} radius={f.polygon ? 5 : 9} pathOptions={{ color: '#fff', weight: 2, fillColor: f.color, fillOpacity: 1 }} eventHandlers={handlers}>
        {tip}
      </CircleMarker>
    </>
  );
}

export type DrawMode = 'polygon' | 'pin';

function ClickCapture({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function FlyTo({ target }: { target: { lat: number; lon: number; zoom?: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], target.zoom ?? 15, { duration: 0.2 });
  }, [target, map]);
  return null;
}

export function DrawMap({
  mode, vertices, closed, point, flyTarget, onMapClick, height = 380,
}: {
  mode: DrawMode;
  vertices: [number, number][]; // [lat, lon]
  closed: boolean;
  point: { lat: number; lon: number } | null;
  flyTarget: { lat: number; lon: number; zoom?: number } | null;
  onMapClick: (lat: number, lon: number) => void;
  height?: number;
}) {
  return (
    <MapContainer center={INDIA_CENTER} zoom={5} style={{ height, width: '100%', cursor: 'crosshair' }} doubleClickZoom={false}>
      <TileLayer url={TILE} attribution={ATTR} />
      <FlyTo target={flyTarget} />
      <ClickCapture onClick={onMapClick} />
      {mode === 'polygon' && vertices.length > 0 && (
        closed
          ? <Polygon positions={vertices} pathOptions={{ color: '#1F4D2B', weight: 2, fillColor: '#2E7D32', fillOpacity: 0.3 }} />
          : <Polyline positions={vertices} pathOptions={{ color: '#1F4D2B', weight: 2, dashArray: '6 6' }} />
      )}
      {mode === 'polygon' && vertices.map((v, i) => (
        <CircleMarker key={i} center={v} radius={i === 0 && !closed ? 7 : 5} pathOptions={{ color: '#fff', weight: 2, fillColor: i === 0 ? '#D9A441' : '#1F4D2B', fillOpacity: 1 }} />
      ))}
      {point && (
        <CircleMarker center={[point.lat, point.lon]} radius={10} pathOptions={{ color: '#fff', weight: 3, fillColor: '#2E7D9A', fillOpacity: 1 }} />
      )}
    </MapContainer>
  );
}
