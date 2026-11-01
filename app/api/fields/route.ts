import { browserKey, body, error, handle, json } from '@/lib/api';
import { FieldCreateSchema } from '@/lib/validation';
import { createField, listFields, publicField } from '@/lib/services/fields';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async (req: Request) => {
  const key = browserKey(req);
  if (!key) return json({ fields: [] });
  return json({ fields: await listFields(key) });
});

export const POST = handle(async (req: Request) => {
  const key = browserKey(req);
  if (!key) return error('Missing browser key.', 400);
  const input = await body(req, FieldCreateSchema);
  const f = await createField(key, input);
  return json({ field: publicField(f) }, 201);
});
