import { handle, json } from '@/lib/api';
import { healthReport } from '@/lib/services/health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async () => json(await healthReport()));
