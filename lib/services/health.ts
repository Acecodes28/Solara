import { getDb } from '../db/client';
import { sourceStatus } from '../db/schema';
import { SOURCES, isConfigured } from '../config/sources';
import { ageHours, sourceState, type SourceState } from '../engine/staleness';

export interface SourceHealth {
  name: string;
  state: SourceState;
  last_success_at: string | null;
  age_hours: number | null;
  last_error: string | null;
  last_error_at: string | null;
  credit: string;
  setup: string | null;
}

export async function healthReport() {
  const db = await getDb();
  const rows = await db.select().from(sourceStatus);
  const now = new Date();
  const sources: SourceHealth[] = SOURCES.map((m) => {
    const r = rows.find((x) => x.sourceName === m.name);
    const configured = isConfigured(m);
    const state = sourceState({ configured, lastSuccessAt: r?.lastSuccessAt ?? null, lastErrorAt: r?.lastErrorAt ?? null, staleHours: m.staleHours, now });
    return {
      name: m.name,
      state,
      last_success_at: r?.lastSuccessAt?.toISOString() ?? null,
      age_hours: r?.lastSuccessAt ? Math.round(ageHours(r.lastSuccessAt, now) * 10) / 10 : null,
      last_error: configured ? r?.lastError ?? null : null,
      last_error_at: configured ? r?.lastErrorAt?.toISOString() ?? null : null,
      credit: m.credit,
      setup: configured ? null : m.setup ?? null,
    };
  });
  return {
    status: 'ok' as const,
    sources,
    ai_configured: isConfigured(SOURCES.find((s) => s.name === 'Gemini')!),
    satellite_configured: isConfigured(SOURCES.find((s) => s.name === 'Copernicus')!),
    checked_at: now.toISOString(),
  };
}
