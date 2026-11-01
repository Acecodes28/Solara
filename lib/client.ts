'use client';

const KEY = 'solara.browserKey';

/** Random 128-bit key that lists the fields this browser created. It is not an identity. */
export function getBrowserKey(): string {
  try {
    let k = localStorage.getItem(KEY);
    if (!k || !/^[a-f0-9]{32}$/.test(k)) {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      k = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(KEY, k);
    }
    return k;
  } catch {
    return '';
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public field?: string) {
    super(message);
  }
}

/** JSON API call. Reads get one automatic retry on network errors; 4xx is never retried. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { 'x-browser-key': getBrowserKey(), ...(init.headers as Record<string, string>) };
  if (init.json !== undefined) headers['content-type'] = 'application/json';
  const doFetch = () => fetch(path, { ...init, method, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body, cache: 'no-store' });
  let res: Response;
  try {
    res = await doFetch();
  } catch {
    if (method !== 'GET') throw new ApiError(0, 'Network error. Check your connection.');
    try { res = await doFetch(); } catch { throw new ApiError(0, 'Network error. Check your connection.'); }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`, (data as { field?: string }).field);
  return data as T;
}
