import { waitUntil } from '@vercel/functions';
import { handle, json, loadField, type RouteCtx } from '@/lib/api';
import { IngestSchema } from '@/lib/validation';
import { runIngestion, startIngestion } from '@/lib/services/ingest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = handle(async (req: Request, { params }: RouteCtx) => {
  const f = await loadField(params.id);
  let kinds: ('history' | 'soil' | 'ndvi' | 'prices')[] | undefined;
  const text = await req.text();
  if (text.trim()) kinds = IngestSchema.parse(JSON.parse(text)).kinds;
  const jobs = await startIngestion(f.id, kinds);
  // Steps run after the response; the client polls GET /api/fields/{id} for progress.
  waitUntil(runIngestion(f.id, jobs.map((j) => ({ id: j.id, kind: j.kind }))));
  return json({ jobs: jobs.map((j) => ({ kind: j.kind, status: j.status })) }, 202);
});
