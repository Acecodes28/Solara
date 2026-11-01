import { z } from 'zod';
import { fetchJson } from './http';
import { SOURCE } from '../config/sources';

export const geminiConfigured = () => !!process.env.GEMINI_API_KEY;

const Resp = z.object({
  candidates: z.array(z.object({
    content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional(),
  })).optional(),
});

/** One JSON-mode completion at temperature 0. Never retried automatically. */
export async function geminiJson(system: string, user: string): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Gemini not configured');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const j = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, Resp, {
    source: SOURCE.gemini,
    method: 'POST',
    retry: false,
    timeoutMs: 30_000,
    headers: { 'x-goog-api-key': key },
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    },
  });
  const text = j.candidates?.[0]?.content?.parts.map((p) => p.text ?? '').join('') ?? '';
  return JSON.parse(text);
}
