'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { ButtonLink, Card, EmptyState, Pill, cx } from '@/components/ui';
import { IconMic, IconPlus, IconSend, IconSpeaker, IconSpark, SolaraMark } from '@/components/icons';
import { api, ApiError } from '@/lib/client';
import { useApi, type FieldListItem } from '@/lib/hooks';
import { useApp } from '@/lib/i18n/context';
import { fmtDateTime } from '@/lib/format';

interface Fact { id: string; label: string; value: number | string | null; unit: string; source: string; fetchedAt: string | null }
interface Msg { role: 'user' | 'ai'; text: string; lang?: 'en' | 'hi'; facts?: Fact[]; answered?: boolean; engine?: string; error?: boolean }

const SUGGEST = {
  en: ['Should I irrigate this week?', 'Is frost or heat coming?', 'What is the season stress risk?', 'Should I sell or hold?', 'Will it rain in the next weeks?'],
  hi: ['क्या इस हफ़्ते सिंचाई करनी चाहिए?', 'क्या पाला या लू आने वाली है?', 'इस मौसम में तनाव का जोखिम कितना है?', 'फसल बेचूँ या रोकूँ?', 'आगे बारिश होगी क्या?'],
};

// Minimal typing for the browser Speech Recognition API.
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

const fmtValue = (f: Fact) => (typeof f.value === 'number' ? `${f.unit === '₹' ? '₹' : ''}${Math.round(f.value * 10) / 10}${f.unit === '₹' || f.unit === 'count' || f.unit === 'text' || f.unit === 'days' ? (f.unit === 'days' ? ' days' : '') : ` ${f.unit}`}` : String(f.value));

export default function AdvisorPage() {
  const { t, lang } = useApp();
  const { data, loading } = useApi<{ fields: FieldListItem[] }>('/api/fields');
  const fields = useMemo(() => data?.fields ?? [], [data]);
  const [fieldId, setFieldId] = useState('');
  const [q, setQ] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechOk, setSpeechOk] = useState(false);
  const [ttsOk, setTtsOk] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSpeechOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    setTtsOk('speechSynthesis' in window);
    const p = new URLSearchParams(window.location.search).get('field');
    if (p) setFieldId(p);
  }, []);
  useEffect(() => {
    if (!fieldId && fields.length) setFieldId(fields[0].id);
  }, [fields, fieldId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

  const field = fields.find((f) => f.id === fieldId);

  const ask = async (question: string) => {
    const text = question.trim();
    if (text.length < 3 || text.length > 300 || !fieldId || busy) return;
    setMsgs((m) => [...m, { role: 'user', text }]);
    setQ('');
    setBusy(true);
    try {
      const r = await api<{ answer: string; lang: 'en' | 'hi'; answered: boolean; engine: string; facts: Fact[] }>('/api/advisor', { method: 'POST', json: { fieldId, question: text } });
      setMsgs((m) => [...m, { role: 'ai', text: r.answer, lang: r.lang, facts: r.facts, answered: r.answered, engine: r.engine }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'ai', text: e instanceof ApiError ? e.message : 'Something went wrong.', error: true }]);
    } finally { setBusy(false); }
  };

  const toggleMic = () => {
    if (!speechOk) return;
    if (listening) { recRef.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition!;
    const rec = new Ctor();
    rec.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => setQ(Array.from(e.results).map((r) => r[0].transcript).join(' '));
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const speak = (m: Msg) => {
    if (!ttsOk) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(m.text);
    u.lang = m.lang === 'hi' ? 'hi-IN' : 'en-IN';
    window.speechSynthesis.speak(u);
  };

  if (!loading && fields.length === 0) {
    return (
      <div className="animate-fadeUp">
        <PageHeader title={t('advisor_title')} subtitle={t('advisor_sub')} />
        <EmptyState message="Solara AI answers questions about one of your fields. Add a field first."><ButtonLink href="/fields/new"><IconPlus size={18} /> {t('addField')}</ButtonLink></EmptyState>
      </div>
    );
  }

  return (
    <div className="animate-fadeUp">
      <PageHeader title={t('advisor_title')} subtitle={t('advisor_sub')} />
      <Card className="flex h-[calc(100vh-230px)] min-h-[480px] flex-col !p-0 sm:h-[calc(100vh-190px)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <SolaraMark size={32} />
          <div className="mr-auto">
            <p className="font-semibold leading-tight">{t('aiName')}</p>
            <p className="text-xs text-muted">Answers only from this field’s data, with the figures it used</p>
          </div>
          <select className="input !min-h-[40px] w-auto max-w-[220px] text-sm" value={fieldId} onChange={(e) => { setFieldId(e.target.value); setMsgs([]); }} aria-label="Field">
            {fields.map((f) => <option key={f.id} value={f.id}>{f.name} · {t(f.crop)}</option>)}
          </select>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-live="polite">
          {msgs.length === 0 && (
            <div className="mx-auto max-w-lg animate-fadeUp pt-6 text-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary"><IconSpark size={28} /></span>
              <h2 className="mt-3 text-lg font-semibold">{lang === 'hi' ? `नमस्ते! मैं सोलारा AI हूँ।` : 'Hello! I am Solara AI.'}</h2>
              <p className="mt-1 text-sm text-muted">{lang === 'hi' ? `${field?.name ?? 'अपने खेत'} के बारे में सिंचाई, पाला, गर्मी, बारिश, तनाव या भाव पूछें।` : `Ask me about irrigation, frost, heat, rain, stress or price for ${field?.name ?? 'your field'}.`}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGEST[lang].map((s) => <button key={s} onClick={() => ask(s)} className={cx('rounded-full border border-line bg-white px-3 py-2 text-sm transition-colors duration-150 hover:border-primary hover:text-primary', lang === 'hi' && 'font-deva')}>{s}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={cx('flex animate-fadeUp gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              {m.role === 'ai' && <span className="mt-1 hidden xs:block"><SolaraMark size={28} /></span>}
              <div className={cx('max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed', m.role === 'user' ? 'rounded-br-md bg-primary text-white' : m.error ? 'rounded-bl-md bg-danger-soft text-danger' : 'rounded-bl-md border border-line bg-white')}>
                <p className={m.lang === 'hi' ? 'font-deva' : ''}>{m.text}</p>
                {m.role === 'ai' && !m.error && (
                  <>
                    {m.facts && m.facts.length > 0 && (
                      <details className="mt-2 text-xs text-muted">
                        <summary className="cursor-pointer select-none font-medium text-primary">Figures used ({m.facts.length})</summary>
                        <ul className="mt-1.5 space-y-1">
                          {m.facts.map((f) => <li key={f.id}><span className="font-medium text-ink">{f.label}: {fmtValue(f)}</span> · {f.source}{f.fetchedAt ? `, fetched ${fmtDateTime(f.fetchedAt)}` : ''}</li>)}
                        </ul>
                      </details>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      {m.answered === false && <Pill>No answer in this field’s data</Pill>}
                      {m.engine === 'model' && m.answered && <Pill tone="water"><IconSpark size={11} /> verified</Pill>}
                      {ttsOk && <button onClick={() => speak(m)} className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-page hover:text-primary" aria-label="Read aloud"><IconSpeaker size={16} /></button>}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex animate-fadeIn items-center gap-2 text-sm text-muted">
              <SolaraMark size={28} />
              <span className="inline-flex gap-1 rounded-2xl border border-line bg-white px-4 py-3">
                {[0, 1, 2].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: `${d * 120}ms` }} />)}
              </span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form className="border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <div className="flex items-end gap-2">
            <button type="button" onClick={toggleMic} disabled={!speechOk} title={speechOk ? (listening ? 'Stop listening' : 'Speak your question') : 'Speech input is not supported in this browser.'}
              aria-label={speechOk ? 'Speak your question' : 'Speech input is not supported in this browser.'}
              className={cx('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40', listening ? 'animate-pulse border-danger bg-danger text-white' : 'border-line text-muted hover:text-primary')}>
              <IconMic size={20} />
            </button>
            <div className="flex-1">
              <textarea rows={1} className={cx('input resize-none py-2.5', lang === 'hi' && 'font-deva')} maxLength={300} value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(q); } }}
                placeholder={lang === 'hi' ? 'अपना सवाल लिखें…' : 'Ask about this field…'} aria-label="Question" />
            </div>
            <button type="submit" disabled={busy || q.trim().length < 3 || !fieldId} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-transform duration-150 hover:bg-primary-dark active:scale-95 disabled:opacity-40" aria-label="Send">
              <IconSend size={18} />
            </button>
          </div>
          <div className="mt-1 flex justify-between px-14 text-[11px] text-muted">
            <span>{t('decisionAid')}</span>
            <span className={q.length > 280 ? 'text-danger' : ''}>{q.length}/300</span>
          </div>
        </form>
      </Card>
      {field && <p className="mt-2 text-center text-xs text-muted"><Link href={`/fields/${field.id}`} className="hover:underline">Open {field.name}</Link></p>}
    </div>
  );
}
