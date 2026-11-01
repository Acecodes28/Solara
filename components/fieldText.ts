import type { StringKey } from '@/lib/i18n/strings';
import { fmtMm } from '@/lib/format';

type T = (k: StringKey, v?: Record<string, string | number>) => string;
type D = { kind: 'irrigate_now'; amountMm: number } | { kind: 'irrigate_soon'; withinDays: number } | { kind: 'no_irrigation' } | null | undefined;

export function decisionText(t: T, d: D, seasonComplete?: boolean): string {
  if (seasonComplete) return t('season_complete');
  if (!d) return t('not_computed');
  if (d.kind === 'irrigate_now') return t('irrigate_now', { mm: fmtMm(d.amountMm, 0) });
  if (d.kind === 'irrigate_soon') return t('irrigate_soon', { n: d.withinDays, days: d.withinDays === 1 ? 'day' : 'days' });
  return t('no_irrigation');
}

export function stageText(t: T, s: string | null | undefined): string {
  if (!s) return '—';
  return t(`stage_${s}` as StringKey);
}

export const ALERT_LABEL: Record<string, string> = { frost: 'Frost', heavy_rain: 'Heavy rain', heatwave: 'Heatwave', irrigate_now: 'Irrigate now' };
