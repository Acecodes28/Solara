import type { ZodType } from 'zod';

export class SourceError extends Error {
  constructor(public source: string, message: string, public status?: number) {
    super(message);
  }
}

interface Opts {
  source: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** One automatic retry on network errors (read requests only). */
  retry?: boolean;
}

async function once(url: string, o: Opts): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 15_000);
  try {
    return await fetch(url, {
      method: o.method ?? 'GET',
      headers: { Accept: 'application/json', ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...o.headers },
      body: o.body == null ? undefined : typeof o.body === 'string' ? o.body : JSON.stringify(o.body),
      signal: ctrl.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch with timeout; retries once on a network error for reads; never retries 4xx. */
export async function request(url: string, o: Opts): Promise<Response> {
  const retry = o.retry ?? (o.method ?? 'GET') === 'GET';
  let res: Response;
  try {
    res = await once(url, o);
  } catch (e) {
    if (!retry) throw new SourceError(o.source, networkMessage(e));
    try {
      res = await once(url, o);
    } catch (e2) {
      throw new SourceError(o.source, networkMessage(e2));
    }
  }
  if (res.status >= 500 && retry) {
    try { res = await once(url, o); } catch (e) { throw new SourceError(o.source, networkMessage(e)); }
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 160).replace(/\s+/g, ' '); } catch { /* ignore */ }
    throw new SourceError(o.source, `HTTP ${res.status}${detail ? `: ${detail}` : ''}`, res.status);
  }
  return res;
}

export async function fetchJson<T>(url: string, schema: ZodType<T>, o: Opts): Promise<T> {
  const res = await request(url, o);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new SourceError(o.source, 'Response was not valid JSON');
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new SourceError(o.source, `Unexpected response shape: ${parsed.error.issues.slice(0, 2).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}

function networkMessage(e: unknown): string {
  if (e instanceof Error && e.name === 'AbortError') return 'Timed out after 15 seconds';
  return `Network error: ${e instanceof Error ? e.message : String(e)}`;
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} exceeded ${Math.round(ms / 1000)} seconds`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
