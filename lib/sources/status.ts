import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { sourceStatus } from '../db/schema';
import type { SourceName } from '../config/sources';

/** Logs record only source name, status and time. */
function log(name: string, status: 'ok' | 'failed') {
  console.info(`[source] ${name} ${status} ${new Date().toISOString()}`);
}

export async function recordSuccess(name: SourceName) {
  const db = await getDb();
  const now = new Date();
  await db.insert(sourceStatus).values({ sourceName: name, lastSuccessAt: now })
    .onConflictDoUpdate({ target: sourceStatus.sourceName, set: { lastSuccessAt: now } });
  log(name, 'ok');
}

export async function recordFailure(name: SourceName, message: string) {
  const db = await getDb();
  const now = new Date();
  const msg = message.slice(0, 300);
  await db.insert(sourceStatus).values({ sourceName: name, lastError: msg, lastErrorAt: now })
    .onConflictDoUpdate({ target: sourceStatus.sourceName, set: { lastError: msg, lastErrorAt: now } });
  log(name, 'failed');
}

/** Runs fn and records the outcome against the source. */
export async function tracked<T>(name: SourceName, fn: () => Promise<T>): Promise<T> {
  try {
    const v = await fn();
    await recordSuccess(name);
    return v;
  } catch (e) {
    await recordFailure(name, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

export async function allStatuses() {
  const db = await getDb();
  return db.select().from(sourceStatus).orderBy(sql`source_name`);
}
