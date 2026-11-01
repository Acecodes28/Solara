'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './client';
import { useApp } from './i18n/context';

/** Fetches a JSON endpoint; refetches on the global refresh button and when `deps` change. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const { refreshTick } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const id = ++seq.current;
    setLoading(true);
    try {
      const d = await api<T>(path);
      if (id === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (id === seq.current) setError(e instanceof ApiError ? e : new ApiError(0, String(e)));
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { load(); }, [load, refreshTick]);
  return { data, error, loading, reload: load, setData };
}

export interface FieldListItem {
  id: string;
  name: string;
  crop: 'Wheat' | 'Soybean';
  sowingDate: string;
  centroid: { lat: number; lon: number };
  polygon: { type: 'Polygon'; coordinates: number[][][] } | null;
  areaHa: number;
  mandi: string | null;
  ingesting: boolean;
  summary: {
    asOf: string;
    stage: 'initial' | 'development' | 'mid' | 'late' | null;
    dayOfSeason: number;
    seasonComplete: boolean;
    decision: { kind: 'irrigate_now'; amountMm: number } | { kind: 'irrigate_soon'; withinDays: number } | { kind: 'no_irrigation' } | null;
    depletion: number | null;
    raw: number | null;
    stressProb: number | null;
    riskStatus: 'ok' | 'insufficient' | 'no_data';
    seasonsUsed: number;
    alertsToday: string[];
    computedAt: string;
    errors: { source: string; message: string; lastSuccessAt: string | null }[];
  } | null;
}
