import { handle, json, loadField, type RouteCtx } from '@/lib/api';
import { getFreshSummary } from '@/lib/services/compute';
import { latestAdvice } from '@/lib/services/fields';
import { factSheet } from '@/lib/services/advice';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async (_req: Request, { params }: RouteCtx) => {
  const f = await loadField(params.id);
  const s = await getFreshSummary(f);
  if (!s) return json({ summary: null, items: [], facts: [] });
  const adv = await latestAdvice(f.id);
  const { facts } = await factSheet(f, s);
  return json({
    decision: s.decision,
    today: s.today,
    raw: s.raw,
    taw: s.taw,
    stage: s.stage,
    seasonComplete: s.seasonComplete,
    dayOfSeason: s.dayOfSeason,
    alerts: s.alerts,
    outlook7: s.outlook7,
    outlook6: s.outlook6,
    weather: s.weather,
    alertsSource: s.alertsSource,
    errors: s.errors,
    computedAt: s.computedAt,
    items: adv?.items ?? [],
    wording: adv?.wording ?? 'standard',
    adviceDate: adv?.date ?? null,
    facts,
  });
});
