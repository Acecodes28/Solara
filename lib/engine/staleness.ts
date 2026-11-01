import { STALE_HOURS } from '../config/thresholds';

export type FactCategory = keyof typeof STALE_HOURS;

export function ageHours(fetchedAt: Date | string, now = new Date()): number {
  return (now.getTime() - new Date(fetchedAt).getTime()) / 3_600_000;
}

/** L16. A fact is stale when it is older than the limit for its category. */
export function isStale(category: FactCategory, fetchedAt: Date | string, now = new Date()): boolean {
  return ageHours(fetchedAt, now) > STALE_HOURS[category];
}

export type SourceState = 'ok' | 'stale' | 'failed' | 'not_configured';

export function sourceState(args: {
  configured: boolean;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  staleHours: number;
  now?: Date;
}): SourceState {
  const { configured, lastSuccessAt, lastErrorAt, staleHours, now = new Date() } = args;
  if (!configured) return 'not_configured';
  if (lastErrorAt && (!lastSuccessAt || lastErrorAt > lastSuccessAt)) return 'failed';
  if (!lastSuccessAt) return 'stale';
  return ageHours(lastSuccessAt, now) > staleHours ? 'stale' : 'ok';
}
