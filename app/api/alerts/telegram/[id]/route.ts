import { eq } from 'drizzle-orm';
import { browserKey, error, handle, json, loadField, type RouteCtx } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { alertLinks } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const DELETE = handle(async (req: Request, { params }: RouteCtx) => {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return error('Link not found.', 404);
  const db = await getDb();
  const [l] = await db.select().from(alertLinks).where(eq(alertLinks.id, params.id));
  if (!l) return error('Link not found.', 404);
  const f = await loadField(l.fieldId);
  if (browserKey(req) !== f.browserKey) return error('Only the browser that created this field can unlink alerts.', 403);
  await db.delete(alertLinks).where(eq(alertLinks.id, l.id));
  return json({ deleted: true });
});
