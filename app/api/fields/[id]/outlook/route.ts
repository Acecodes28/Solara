import { handle, json, loadField, type RouteCtx } from '@/lib/api';
import { getFreshSummary } from '@/lib/services/compute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async (_req: Request, { params }: RouteCtx) => {
  const f = await loadField(params.id);
  const s = await getFreshSummary(f);
  return json({ outlook7: s?.outlook7 ?? null, outlook6: s?.outlook6 ?? null, seasonComplete: s?.seasonComplete ?? false });
});
