import { z } from 'zod';
import { fetchJson } from './http';
import { SOURCE } from '../config/sources';

export const telegramConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN;

/** Sends a message to a chat a user has linked. Never retried automatically. */
export async function sendTelegram(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Telegram not configured');
  await fetchJson(`https://api.telegram.org/bot${token}/sendMessage`, z.object({ ok: z.literal(true) }), {
    source: SOURCE.telegram,
    method: 'POST',
    body: { chat_id: chatId, text, disable_web_page_preview: true },
    retry: false,
  });
}
