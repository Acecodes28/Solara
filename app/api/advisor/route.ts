import { body, error, handle, json, loadField } from '@/lib/api';
import { AdvisorSchema, MSG } from '@/lib/validation';
import { answerQuestion } from '@/lib/services/advisor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = handle(async (req: Request) => {
  const input = await body(req, AdvisorSchema);
  const q = input.question.trim();
  if (q.length > 300) return error(MSG.question, 422, { field: 'question' });
  if (q.length < 3) return error('Ask a question of at least 3 characters.', 422, { field: 'question' });
  const f = await loadField(input.fieldId);
  const a = await answerQuestion(f, q);
  return json({
    answer: a.answer,
    lang: a.lang,
    answered: a.answered,
    engine: a.engine,
    facts: a.facts.map((x) => ({ id: x.id, label: x.label, value: x.value, unit: x.unit, source: x.source, fetchedAt: x.fetchedAt })),
  });
});
