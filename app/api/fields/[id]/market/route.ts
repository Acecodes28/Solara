import { handle, json, loadField, type RouteCtx } from '@/lib/api';
import { marketAnalysis } from '@/lib/services/market';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async (_req: Request, { params }: RouteCtx) => {
  const f = await loadField(params.id);
  return json(await marketAnalysis(f, { live: true }));
});
