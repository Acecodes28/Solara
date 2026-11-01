import { handle, json, loadField, type RouteCtx } from '@/lib/api';
import { getFreshSummary } from '@/lib/services/compute';
import { THRESHOLDS } from '@/lib/config/thresholds';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async (_req: Request, { params }: RouteCtx) => {
  const f = await loadField(params.id);
  const s = await getFreshSummary(f);
  return json({
    risk: s?.risk ?? null,
    minSeasons: THRESHOLDS.minAnalogSeasons,
    dayOfSeason: s?.dayOfSeason ?? null,
    seasonComplete: s?.seasonComplete ?? false,
    weather: s?.weather ?? null,
    errors: s?.errors ?? [],
  });
});
