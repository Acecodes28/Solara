import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { ZodError, type ZodTypeAny, type output } from 'zod';
import { getDb } from './db/client';
import { fields, type Field } from './db/schema';
import { MSG, ValidationError, BrowserKeySchema } from './validation';
import { ConflictError } from './services/ingest';

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export const error = (message: string, status: number, extra: Record<string, unknown> = {}) => json({ error: message, ...extra }, status);

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Parses a JSON body against a strict schema (unknown fields are rejected). */
export async function body<S extends ZodTypeAny>(req: Request, schema: S): Promise<output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, 'Request body must be JSON.');
  }
  return schema.parse(raw);
}

export function browserKey(req: Request): string | null {
  const k = req.headers.get('x-browser-key');
  return k && BrowserKeySchema.safeParse(k).success ? k : null;
}

export async function loadField(id: string): Promise<Field> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, MSG.notFound);
  const db = await getDb();
  const [f] = await db.select().from(fields).where(eq(fields.id, id));
  if (!f) throw new HttpError(404, MSG.notFound);
  return f;
}

/** Wraps a route handler with uniform error responses. Never logs request bodies or secrets. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return error(e.message, e.status);
      if (e instanceof ValidationError) return error(e.message, 422, e.field ? { field: e.field } : {});
      if (e instanceof ConflictError) return error(e.message, 409);
      if (e instanceof ZodError) {
        const issue = e.issues[0];
        const unknown = issue.code === 'unrecognized_keys' ? `Unknown field: ${issue.keys.join(', ')}.` : null;
        return error(unknown ?? issue.message, 422, { field: issue.path.join('.') || undefined });
      }
      console.error('[api] unhandled error', e instanceof Error ? e.name : 'unknown');
      return error('Something went wrong on the server.', 500);
    }
  };
}

export type RouteCtx = { params: { id: string } };
