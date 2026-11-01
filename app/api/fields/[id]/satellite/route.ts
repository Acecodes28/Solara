import { handle, json, loadField, type RouteCtx } from '@/lib/api';
import { getFreshSummary } from '@/lib/services/compute';
import { satelliteAnalysis } from '@/lib/services/satellite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async (_req: Request, { params }: RouteCtx) => {
  const f = await loadField(params.id);
  const s = await getFreshSummary(f);
  return json({ ...(await satelliteAnalysis(f, s)), stressProb: s?.risk.prob ?? null });
});
