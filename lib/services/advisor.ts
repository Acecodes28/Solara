import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { advice, type Field } from '../db/schema';
import { verifyText, type Fact } from '../engine/verify';
import { todayIst } from '../engine/dates';
import { geminiConfigured, geminiJson } from '../sources/gemini';
import { recordFailure, recordSuccess } from '../sources/status';
import { SOURCE } from '../config/sources';
import { getFreshSummary } from './compute';
import { factSheet } from './advice';
import type { AdviceItem, FieldSummary } from './types';

export const REFUSAL = {
  en: 'I cannot answer that from the data for this field. Try asking about irrigation, frost, heat, rain, stress or price.',
  hi: 'इस खेत के डेटा से मैं इसका उत्तर नहीं दे सकता। सिंचाई, पाला, गर्मी, बारिश, तनाव या भाव के बारे में पूछें।',
};

export type Lang = 'en' | 'hi';
export const detectLang = (q: string): Lang => (/[ऀ-ॿ]/.test(q) ? 'hi' : 'en');

export interface AdvisorAnswer {
  answer: string;
  lang: Lang;
  answered: boolean;
  facts: Fact[];
  engine: 'model' | 'rules';
}

type Topic = 'irrigation' | 'frost' | 'heat' | 'rain' | 'stress' | 'price' | 'stage' | 'soil';

const TOPICS: { topic: Topic; re: RegExp }[] = [
  { topic: 'irrigation', re: /irrigat|water(ing)?\b|moisture|depletion|सिंचाई|पानी|नमी|सींच/i },
  { topic: 'frost', re: /frost|cold|freez|पाला|पाले|ठंड|शीत/i },
  { topic: 'heat', re: /heat|hot|temperature|लू|गर्मी|तापमान|गरम/i },
  { topic: 'rain', re: /rain|monsoon|dry|बारिश|वर्षा|बरसात|सूखा/i },
  { topic: 'stress', re: /stress|risk|drought|chance|तनाव|जोखिम|खतरा|संभावना/i },
  { topic: 'price', re: /price|sell|hold|mandi|market|rate|store|भाव|कीमत|दाम|बेच|मंडी|बाज़ार|बाजार|रोक/i },
  { topic: 'stage', re: /stage|growth|gdd|degree|अवस्था|चरण|बढ़वार/i },
  { topic: 'soil', re: /soil|clay|sand|मिट्टी|मृदा/i },
];

const r1 = (n: number) => Math.round(n * 10) / 10;
const fv = (facts: Fact[], id: string) => facts.find((f) => f.id === id);

function ruleAnswer(topics: Topic[], s: FieldSummary, facts: Fact[], items: AdviceItem[], lang: Lang): { text: string; ids: string[] } | null {
  const parts: string[] = [];
  const ids = new Set<string>();
  const use = (...xs: string[]) => xs.forEach((x) => fv(facts, x) && ids.add(x));
  const itemText = (types: AdviceItem['type'][]) => items.filter((i) => types.includes(i.type)).map((i) => { i.factIds.forEach((x) => ids.add(x)); return i.text[lang]; });

  for (const t of topics) {
    if (t === 'irrigation') {
      const tx = itemText(['irrigate_now', 'irrigate_soon', 'no_irrigation']);
      if (tx.length) parts.push(...tx);
      else if (s.seasonComplete) parts.push(lang === 'hi' ? 'इस खेत का मौसम पूरा हो चुका है, इसलिए सिंचाई का निर्णय नहीं है।' : 'This field\'s season is complete, so there is no irrigation decision.');
    } else if (t === 'frost' || t === 'heat' || t === 'rain') {
      const type = t === 'frost' ? 'frost' : t === 'heat' ? 'heatwave' : 'heavy_rain';
      const tx = itemText([type]);
      if (tx.length) parts.push(...tx);
      else parts.push(lang === 'hi'
        ? `अगले तीन दिनों के पूर्वानुमान में ${t === 'frost' ? 'पाले' : t === 'heat' ? 'लू' : 'भारी बारिश'} की कोई चेतावनी नहीं है।`
        : `The forecast for the next three days raises no ${t === 'frost' ? 'frost' : t === 'heat' ? 'heatwave' : 'heavy-rain'} alert.`);
      if (t === 'rain' && s.outlook6) {
        const rows = s.outlook6.rows.filter((r) => r.prob != null);
        if (rows.length) {
          rows.forEach((r) => use(`p_dry_w${r.week}`));
          parts.push(lang === 'hi'
            ? `सामान्य से आधी से कम बारिश की संभावना: ${rows.map((r) => `सप्ताह ${r.week}: ${r1(r.prob! * 100)}%`).join(', ')}।`
            : `Chance of rain below half of normal: ${rows.map((r) => `week ${r.week}: ${r1(r.prob! * 100)}%`).join(', ')}.`);
        }
      }
    } else if (t === 'stress') {
      if (s.risk.status === 'ok' && s.risk.prob != null) {
        use('stress_prob', 'stress_seasons');
        parts.push(lang === 'hi'
          ? `इस मौसम के महत्वपूर्ण चरण में पानी के तनाव की संभावना ${r1(s.risk.prob * 100)}% है, ${s.risk.n} पिछले मौसमों के आधार पर।`
          : `The chance of a water-stress period in the critical stage this season is ${r1(s.risk.prob * 100)}%, based on ${s.risk.n} past seasons.`);
      } else {
        parts.push(lang === 'hi' ? `अभी पर्याप्त इतिहास नहीं है: 10 में से ${s.risk.n} मौसम।` : `Not enough history yet: ${s.risk.n} of 10 seasons.`);
      }
    } else if (t === 'price') {
      const tx = itemText(['sell', 'hold']);
      if (tx.length) parts.push(...tx);
      else parts.push(lang === 'hi' ? 'इस खेत की मंडी के लिए पर्याप्त भाव इतिहास संग्रहीत नहीं है।' : 'Not enough price history is stored for this field\'s mandi.');
    } else if (t === 'stage') {
      if (s.stage) {
        use('stage', 'day_of_season');
        const st = lang === 'hi' ? { initial: 'प्रारंभिक', development: 'विकास', mid: 'मध्य', late: 'अंतिम' }[s.stage] : s.stage;
        parts.push(lang === 'hi' ? `फसल ${st} अवस्था में है (बुवाई के बाद दिन ${s.dayOfSeason})।` : `The crop is in the ${st} stage (day ${s.dayOfSeason} after sowing).`);
      }
      if (s.gdd != null) {
        use('gdd');
        parts.push(lang === 'hi' ? `अब तक ग्रोइंग डिग्री डेज़: ${r1(s.gdd)}।` : `Growing degree days so far: ${r1(s.gdd)}.`);
      }
    } else if (t === 'soil') {
      if (s.taw != null && s.raw != null) {
        use('taw', 'raw');
        parts.push(lang === 'hi'
          ? `जड़ क्षेत्र में कुल उपलब्ध पानी ${r1(s.taw)} mm है; ${r1(s.raw)} mm कमी के बाद फसल पर तनाव शुरू होता है।`
          : `The root zone holds ${r1(s.taw)} mm of available water; the crop starts to stress after ${r1(s.raw)} mm of depletion.`);
      }
    }
  }
  if (!parts.length) return null;
  return { text: [...new Set(parts)].join(' '), ids: [...ids] };
}

const ModelAnswer = z.object({ answerable: z.boolean(), answer: z.string().max(1200), fact_ids: z.array(z.string()) });

const ADVISOR_RULES = `You are Solara AI, a field advisor for one farm field in India.
Answer ONLY from the facts and advice items given. Never compute, estimate or invent numbers; copy numbers exactly (rounding to one decimal is allowed).
Reply in the language of the question (English, or Hindi in Devanagari). Keep it under 90 words, plain and practical.
If the facts do not answer the question, set answerable to false.
Return JSON: {"answerable": boolean, "answer": string, "fact_ids": string[]} listing the fact IDs you used.`;

export async function answerQuestion(field: Field, question: string): Promise<AdvisorAnswer> {
  const lang = detectLang(question);
  const summary = await getFreshSummary(field);
  if (!summary) return { answer: REFUSAL[lang], lang, answered: false, facts: [], engine: 'rules' };
  const { facts } = await factSheet(field, summary);
  const db = await getDb();
  const [adv] = await db.select().from(advice).where(and(eq(advice.fieldId, field.id), eq(advice.date, todayIst())));
  const items = (adv?.items as AdviceItem[] | undefined) ?? [];
  const topics = TOPICS.filter((t) => t.re.test(question)).map((t) => t.topic);

  if (geminiConfigured()) {
    try {
      const raw = await geminiJson(ADVISOR_RULES, JSON.stringify({
        question,
        facts: facts.map(({ id, label, value, unit }) => ({ id, label, value, unit })),
        advice_items: items.map((i) => ({ type: i.type, text: i.text[lang], fact_ids: i.factIds })),
      }));
      await recordSuccess(SOURCE.gemini);
      const m = ModelAnswer.safeParse(raw);
      if (m.success) {
        if (!m.data.answerable) return { answer: REFUSAL[lang], lang, answered: false, facts: [], engine: 'model' };
        const used = facts.filter((f) => m.data.fact_ids.includes(f.id));
        if (used.length > 0 && verifyText(m.data.answer, facts).ok) {
          return { answer: m.data.answer, lang, answered: true, facts: used, engine: 'model' };
        }
      }
    } catch (e) {
      await recordFailure(SOURCE.gemini, e instanceof Error ? e.message : String(e));
    }
  }

  const r = topics.length ? ruleAnswer(topics, summary, facts, items, lang) : null;
  if (!r || !verifyText(r.text, facts).ok) return { answer: REFUSAL[lang], lang, answered: false, facts: [], engine: 'rules' };
  return { answer: r.text, lang, answered: true, facts: facts.filter((f) => r.ids.includes(f.id)), engine: 'rules' };
}
