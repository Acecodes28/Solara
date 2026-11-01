import { error, handle, json } from '@/lib/api';
import { checkCronSecret, runDaily } from '@/lib/services/alerts';
import { MSG } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export const GET = handle(async (req: Request) => {
  if (!checkCronSecret(req.headers.get('authorization'))) return error(MSG.unauthorised, 401);
  return json({ ok: true, ...(await runDaily()) });
});
