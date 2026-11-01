import { NextResponse, type NextRequest } from 'next/server';

// 60 API requests per minute per IP (per server instance). The cron route is exempt; it checks its own secret.
const WINDOW_MS = 60_000;
const LIMIT = Number(process.env.RATE_LIMIT_PER_MIN) || 60;
const hits = new Map<string, { count: number; start: number }>();

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/cron/')) return NextResponse.next();
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.ip || 'local';
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.start > WINDOW_MS) {
    hits.set(ip, { count: 1, start: now });
  } else if (++h.count > LIMIT) {
    return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil((h.start + WINDOW_MS - now) / 1000)) } });
  }
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
  }
  return NextResponse.next();
}

export const config = { matcher: '/api/:path*' };
