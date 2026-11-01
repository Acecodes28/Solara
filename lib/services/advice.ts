import { and, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { advice, type Field } from '../db/schema';
import { buildFacts, templateAdvice, type MarketFacts } from '../engine/advice';
import { verifyText, type Fact } from '../engine/verify';
import { addDays, todayIst } from '../engine/dates';
import { geminiConfigured, geminiJson } from '../sources/gemini';
import { recordFailure, recordSuccess } from '../sources/status';
import { SOURCE } from '../config/sources';
import { marketAnalysis } from './market';
import type { AdviceItem, FieldSummary } from './types';

export async function marketFacts(field: Field): Promise<MarketFacts | null> {
  const m = await marketAnalysis(field);
  if (m.status !== 'ok' || !m.result) return null;
  return { result: m.result, mandi: field.mandi!, source: m.source ?? SOURCE.ceda, fetchedAt: m.fetchedAt };
}

export async function factSheet(field: Field, summary: FieldSummary) {
  const market = await marketFacts(field);
  return { facts: buildFacts(summary, market), market };
}

const ModelItems = z.object({
  items: z.array(z.object({
    type: z.enum(['irrigate_now', 'irrigate_soon', 'no_irrigation', 'frost', 'heavy_rain', 'heatwave', 'sell', 'hold', 'monitor']),
    title_en: z.string().max(120),
    title_hi: z.string().max(160),
    text_en: z.string().max(600),
    text_hi: z.string().max(800),
    fact_ids: z.array(z.string()),
  })).max(8),
});

const ADVICE_RULES = `You are Solara AI, writing short field advice for an Indian farmer.
Rules:
- Use ONLY the facts provided. Never compute, estimate or invent a number. Copy numbers exactly as given (you may round to one decimal).
- Write one item per template item provided, keeping the same type and meaning, in plain words. Provide English and Hindi (Devanagari).
- Each item lists the fact IDs it uses in fact_ids.
- Do not add advice about pests, diseases, yields or payments.
Return JSON: {"items":[{"type","title_en","title_hi","text_en","text_hi","fact_ids"}]}.`;

/** Model wording, verified number by number (L13). Returns null if unavailable or any check fails. */
async function modelAdvice(facts: Fact[], template: AdviceItem[]): Promise<AdviceItem[] | null> {
  if (!geminiConfigured() || template.length === 0) return null;
  let raw: unknown;
  try {
    raw = await geminiJson(ADVICE_RULES, JSON.stringify({ facts: facts.map(({ id, label, value, unit }) => ({ id, label, value, unit })), template_items: template.map((t) => ({ type: t.type, text: t.text.en })) }));
    await recordSuccess(SOURCE.gemini);
  } catch (e) {
    await recordFailure(SOURCE.gemini, e instanceof Error ? e.message : String(e));
    return null;
  }
  const parsed = ModelItems.safeParse(raw);
  if (!parsed.success) return null;
  const ids = new Set(facts.map((f) => f.id));
  const items: AdviceItem[] = [];
  for (const it of parsed.data.items) {
    const all = [it.title_en, it.title_hi, it.text_en, it.text_hi];
    if (!all.every((t) => verifyText(t, facts).ok)) return null;
    items.push({ type: it.type, title: { en: it.title_en, hi: it.title_hi }, text: { en: it.text_en, hi: it.text_hi }, factIds: it.fact_ids.filter((id) => ids.has(id)) });
  }
  return items.length === template.length ? items : null;
}

export async function buildAndStoreAdvice(field: Field, summary: FieldSummary) {
  const db = await getDb();
  const { facts, market } = await factSheet(field, summary);
  const template = templateAdvice(summary, facts, market);
  const model = await modelAdvice(facts, template);
  const items = model ?? template;
  const wording = model ? 'model' : geminiConfigured() ? 'template_fallback' : 'standard';
  const today = todayIst();
  await db.insert(advice).values({ fieldId: field.id, date: today, items, wording })
    .onConflictDoUpdate({ target: [advice.fieldId, advice.date], set: { items, wording, createdAt: new Date() } });
  await db.delete(advice).where(and(eq(advice.fieldId, field.id), lt(advice.date, addDays(today, -30))));
  return { items, wording, facts };
}
