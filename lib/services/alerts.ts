import { and, eq, isNotNull } from 'drizzle-orm';
import { timingSafeEqual } from 'crypto';
import { getDb } from '../db/client';
import { alertEvents, alertLinks, fields } from '../db/schema';
import { sendTelegram, telegramConfigured } from '../sources/telegram';
import { recordFailure, recordSuccess } from '../sources/status';
import { SOURCE } from '../config/sources';
import { todayIst } from '../engine/dates';
import { computeField } from './compute';
import { runIngestion, startIngestion, ConflictError } from './ingest';
import type { FieldSummary } from './types';

export function checkCronSecret(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  if (got.length !== expected.length) {
    timingSafeEqual(expected, expected); // keep timing similar
    return false;
  }
  return timingSafeEqual(got, expected);
}

type AlertType = 'irrigate_now' | 'frost' | 'heavy_rain' | 'heatwave';

function alertMessages(fieldName: string, s: FieldSummary): { type: AlertType; text: string }[] {
  const out: { type: AlertType; text: string }[] = [];
  const head = `Solara AI · ${fieldName}`;
  if (s.decision?.kind === 'irrigate_now') {
    out.push({ type: 'irrigate_now', text: `${head}\nIrrigate ${s.decision.amountMm.toFixed(1)} mm now. Root-zone depletion has passed the ${s.raw?.toFixed(1)} mm stress point.\nDecision aid. Not agronomy advice.` });
  }
  for (const a of s.alerts) {
    const label = a.type === 'frost' ? 'Frost' : a.type === 'heavy_rain' ? 'Heavy rain' : 'Heatwave';
    out.push({ type: a.type, text: `${head}\n${label} on ${a.date}: forecast ${a.value.toFixed(1)} ${a.unit} (threshold ${a.threshold} ${a.unit === 'mm' ? 'mm' : '°C'}).\n${a.action}\nDecision aid. Not agronomy advice.` });
  }
  return out;
}

/** Sends each new alert once per field, type and day. A failed send is not marked sent and is retried on the next run. */
export async function dispatchAlerts(fieldId: string, s: FieldSummary, fieldName: string) {
  const db = await getDb();
  const links = await db.select().from(alertLinks).where(eq(alertLinks.fieldId, fieldId));
  if (!links.length || !telegramConfigured()) return { sent: 0, failed: 0, skipped: 0 };
  const date = todayIst();
  let sent = 0, failed = 0, skipped = 0;
  for (const m of alertMessages(fieldName, s)) {
    await db.insert(alertEvents).values({ fieldId, type: m.type, date }).onConflictDoNothing();
    const [ev] = await db.select().from(alertEvents).where(and(eq(alertEvents.fieldId, fieldId), eq(alertEvents.type, m.type), eq(alertEvents.date, date)));
    if (ev.sentAt) { skipped++; continue; }
    let allOk = true;
    for (const l of links) {
      try {
        await sendTelegram(l.telegramChatId, m.text);
      } catch {
        allOk = false;
      }
    }
    if (allOk) {
      await db.update(alertEvents).set({ sentAt: new Date() }).where(eq(alertEvents.id, ev.id));
      await recordSuccess(SOURCE.telegram);
      sent++;
    } else {
      await recordFailure(SOURCE.telegram, 'Could not deliver to a linked chat');
      failed++;
    }
  }
  return { sent, failed, skipped };
}

/** Daily job: refresh weather for linked fields, recompute, and send new alerts. */
export async function runDaily() {
  const db = await getDb();
  const linked = await db.selectDistinct({ id: alertLinks.fieldId }).from(alertLinks);
  const report: { fieldId: string; sent: number; failed: number; skipped: number; note?: string }[] = [];
  for (const { id } of linked) {
    const [f] = await db.select().from(fields).where(eq(fields.id, id));
    if (!f) continue;
    let note: string | undefined;
    try {
      const jobs = await startIngestion(id, ['history']);
      await runIngestion(id, jobs);
    } catch (e) {
      note = e instanceof ConflictError ? 'ingestion already running; used stored data' : 'refresh failed; used stored data';
      await computeField(f, { fetchEnsembles: true });
    }
    const { getSummary } = await import('./compute');
    const s = await getSummary(id);
    if (!s) continue;
    const r = await dispatchAlerts(id, s, f.name);
    report.push({ fieldId: id, ...r, note });
  }
  return { fields: report.length, report };
}

export async function linkedChats(fieldId: string) {
  const db = await getDb();
  return db.select({ id: alertLinks.id, createdAt: alertLinks.createdAt, chatId: alertLinks.telegramChatId }).from(alertLinks).where(eq(alertLinks.fieldId, fieldId));
}

export async function sentEvents(fieldId: string) {
  const db = await getDb();
  return db.select().from(alertEvents).where(and(eq(alertEvents.fieldId, fieldId), isNotNull(alertEvents.sentAt)));
}
