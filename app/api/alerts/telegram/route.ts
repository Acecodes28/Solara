import { body, browserKey, error, handle, json, loadField } from '@/lib/api';
import { TelegramLinkSchema } from '@/lib/validation';
import { getDb } from '@/lib/db/client';
import { alertLinks } from '@/lib/db/schema';
import { sendTelegram, telegramConfigured } from '@/lib/sources/telegram';
import { recordFailure, recordSuccess } from '@/lib/sources/status';
import { SOURCE } from '@/lib/config/sources';
import { linkedChats, sentEvents } from '@/lib/services/alerts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const mask = (id: number) => `…${String(Math.abs(id)).slice(-3)}`;

export const GET = handle(async (req: Request) => {
  const fieldId = new URL(req.url).searchParams.get('fieldId') ?? '';
  const f = await loadField(fieldId);
  const owned = browserKey(req) === f.browserKey;
  const links = owned ? await linkedChats(f.id) : [];
  return json({
    configured: telegramConfigured(),
    links: links.map((l) => ({ id: l.id, chat: mask(l.chatId), createdAt: l.createdAt.toISOString() })),
    sent: owned ? (await sentEvents(f.id)).map((e) => ({ type: e.type, date: e.date, sentAt: e.sentAt?.toISOString() })) : [],
  });
});

/** Links a chat after sending a confirmation message to it; nothing is stored if the chat cannot be reached. */
export const POST = handle(async (req: Request) => {
  const input = await body(req, TelegramLinkSchema);
  const f = await loadField(input.fieldId);
  if (browserKey(req) !== f.browserKey) return error('Only the browser that created this field can link alerts.', 403);
  if (!telegramConfigured()) return error('Telegram alerts are not configured on this server.', 503);
  try {
    await sendTelegram(input.chatId, `Solara AI: this chat will receive alerts for the field "${f.name}" (irrigation, frost, heavy rain, heatwave). Each alert is sent at most once a day.\nDecision aid. Not agronomy or financial advice.`);
    await recordSuccess(SOURCE.telegram);
  } catch {
    await recordFailure(SOURCE.telegram, 'Could not deliver to a chat during linking');
    return error('Could not send. Check the chat ID.', 502);
  }
  const db = await getDb();
  const [l] = await db.insert(alertLinks).values({ fieldId: f.id, telegramChatId: input.chatId }).onConflictDoNothing().returning();
  return json({ linked: true, id: l?.id ?? null, chat: mask(input.chatId) }, 201);
});
