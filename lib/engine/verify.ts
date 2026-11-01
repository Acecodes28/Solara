/** L13 verifier: every number in generated text must match a fact within tolerance. */

export type FactUnit = 'mm' | '%' | '°C' | '₹' | 'ha' | 'q' | 'days' | 'count' | 'ratio' | 'text';

export interface Fact {
  id: string;
  label: string;
  value: number | string | null;
  unit: FactUnit;
  source: string;
  fetchedAt: string | null;
}

const TOL: Record<string, number> = { mm: 0.5, '%': 0.5, '°C': 0.5, '₹': 1, ha: 0.01, q: 0.5, count: 0, ratio: 0.01 };

interface Token { value: number; unit: FactUnit | null; raw: string }

/** Removes dates, times and day/month counts, which are exempt. */
function stripExempt(text: string): string {
  return text
    .replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b(\s+\d{4})?/gi, ' ')
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\b(,?\s+\d{4})?/gi, ' ')
    .replace(/(week|day|सप्ताह|दिन)\s+\d+/gi, ' ')
    .replace(/(\d+)(\s*(-|to|से|–)\s*\d+)?\s*(days?|weeks?|months?|seasons?|years?|hours?|दिन|हफ़्ते|सप्ताह|महीने|महीना|मौसम|साल|वर्ष|घंटे)/gi, ' ');
}

export function extractNumbers(text: string): Token[] {
  const s = stripExempt(text);
  const re = /(₹\s?)?(?<![\p{L}\d.\-])(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?(?![\p{L}\d])\s*(mm|%|°\s?C|ha|q(?:uintals?)?|प्रतिशत|मिमी)?/gu;
  const out: Token[] = [];
  for (const m of s.matchAll(re)) {
    const value = parseFloat((m[2] + (m[3] ?? '')).replace(/,/g, ''));
    let unit: FactUnit | null = null;
    if (m[1]) unit = '₹';
    else if (m[4]) {
      const u = m[4].replace(/\s/g, '');
      unit = u === 'mm' || u === 'मिमी' ? 'mm' : u === '%' || u === 'प्रतिशत' ? '%' : u.startsWith('°') ? '°C' : u === 'ha' ? 'ha' : 'q';
    }
    out.push({ value, unit, raw: m[0] });
  }
  return out;
}

export interface VerifyResult { ok: boolean; failures: string[] }

export function verifyText(text: string, facts: Fact[]): VerifyResult {
  const numeric = facts.filter((f): f is Fact & { value: number } => typeof f.value === 'number' && Number.isFinite(f.value));
  const failures: string[] = [];
  for (const t of extractNumbers(text)) {
    const candidates = t.unit ? numeric.filter((f) => f.unit === t.unit) : numeric;
    const match = candidates.some((f) => {
      const tol = TOL[f.unit] ?? 0.5;
      return Math.abs(f.value - t.value) <= tol + 1e-9;
    });
    if (!match) failures.push(t.raw.trim());
  }
  return { ok: failures.length === 0, failures };
}
