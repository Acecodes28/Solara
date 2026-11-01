import fs from 'fs';
import path from 'path';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

interface DbHandle {
  db: Db;
  exec: (sql: string) => Promise<void>;
  query: (sql: string) => Promise<Record<string, unknown>[]>;
  transaction: (sql: string) => Promise<void>;
}

const g = globalThis as unknown as { __solaraDb?: Promise<DbHandle> };

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. See .env.example.');
  return url;
}

async function open(): Promise<DbHandle> {
  const url = databaseUrl();
  if (url.startsWith('pglite:')) {
    if (process.env.VERCEL) {
      throw new Error('DATABASE_URL points to the local embedded database, which cannot persist on Vercel. Set it to a Postgres connection string (for example Neon or Supabase).');
    }
    // Embedded Postgres for local development; same SQL and schema as production Postgres.
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const dir = path.resolve(process.cwd(), url.replace(/^pglite:(\/\/)?/, '') || './data/pgdata');
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const client = new PGlite(dir);
    await client.waitReady;
    return {
      db: drizzle(client, { schema }) as unknown as Db,
      exec: async (s) => { await client.exec(s); },
      query: async (s) => (await client.query<Record<string, unknown>>(s)).rows,
      transaction: async (s) => { await client.transaction(async (tx) => { await tx.exec(s); }); },
    };
  }
  const postgres = (await import('postgres')).default;
  const { drizzle } = await import('drizzle-orm/postgres-js');
  // postgres-js sends unknown URL options to the server as settings; channel_binding is a libpq-only option.
  const pgUrl = url.replace(/([?&])channel_binding=[^&]*&?/, '$1').replace(/[?&]$/, '');
  const client = postgres(pgUrl, { max: 5, prepare: false, connect_timeout: 15 });
  return {
    db: drizzle(client, { schema }),
    exec: async (s) => { await client.unsafe(s); },
    query: async (s) => (await client.unsafe(s)) as unknown as Record<string, unknown>[],
    transaction: async (s) => { await client.begin(async (tx) => { await tx.unsafe(s); }); },
  };
}

/** Applies the SQL files in drizzle/ in name order, once each. */
async function migrate(h: DbHandle) {
  await h.exec('CREATE TABLE IF NOT EXISTS "_solara_migrations" ("name" text PRIMARY KEY, "applied_at" timestamptz NOT NULL DEFAULT now())');
  const dir = path.resolve(process.cwd(), 'drizzle');
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const done = new Set((await h.query('SELECT name FROM "_solara_migrations"')).map((r) => String(r.name)));
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      await h.transaction(`${sql}\nINSERT INTO "_solara_migrations" ("name") VALUES ('${f}');`);
    } catch (e) {
      // Another server instance may have applied it at the same moment (serverless cold starts).
      const now = new Set((await h.query('SELECT name FROM "_solara_migrations"')).map((r) => String(r.name)));
      if (!now.has(f)) throw e;
    }
  }
}

export async function getHandle(): Promise<DbHandle> {
  if (!g.__solaraDb) {
    g.__solaraDb = (async () => {
      const h = await open();
      await migrate(h);
      return h;
    })().catch((e) => {
      g.__solaraDb = undefined;
      throw e;
    });
  }
  return g.__solaraDb;
}

export async function getDb(): Promise<Db> {
  return (await getHandle()).db;
}

export { schema };
