import { handle, json, loadField, type RouteCtx } from '@/lib/api';
import { getFreshSummary } from '@/lib/services/compute';
import { priceBacktestFor } from '@/lib/services/market';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async (_req: Request, { params }: RouteCtx) => {
  const f = await loadField(params.id);
  const s = await getFreshSummary(f);
  const seasons = (s?.risk.similar ?? [])
    .filter((x) => x.looProb != null)
    .sort((a, b) => a.year - b.year)
    .map((x) => ({ year: x.year, predicted: x.looProb, stressFlag: x.stressFlag, criticalStressDays: x.criticalStressDays, match: (x.looProb! >= 0.5 ? 1 : 0) === x.stressFlag }));
  return json({
    stress: { status: s?.risk.status ?? 'no_data', validation: s?.risk.validation ?? null, seasons, n: s?.risk.n ?? 0 },
    price: await priceBacktestFor(f),
  });
});
