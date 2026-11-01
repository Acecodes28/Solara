'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/hooks';
import { useApp } from '@/lib/i18n/context';
import { api, ApiError } from '@/lib/client';
import { fmtDate, fmtMm, fmtPct } from '@/lib/format';
import { Banner, Button, Card, CardTitle, ErrorsBanner, Pill, SourceLine, cx } from '../ui';
import { IconAlert, IconChat, IconDrop, IconRain, IconSnow, IconSun, IconSpark } from '../icons';
import { decisionText } from '../fieldText';
import { TabState, useField } from './common';

interface Fact { id: string; label: string; value: number | string | null; unit: string; source: string; fetchedAt: string | null }
interface AdviceItem { type: string; title: { en: string; hi: string }; text: { en: string; hi: string }; factIds: string[] }
interface AlertT { type: 'frost' | 'heavy_rain' | 'heatwave'; date: string; threshold: number; value: number; unit: string; action: string; actionHi: string }
interface AdviceResp {
  decision: { kind: 'irrigate_now'; amountMm: number } | { kind: 'irrigate_soon'; withinDays: number } | { kind: 'no_irrigation' } | null;
  today: { date: string; depletion: number; ks: number } | null;
  raw: number | null; taw: number | null; stage: string | null; seasonComplete: boolean; dayOfSeason: number;
  alerts: AlertT[];
  outlook7: { probByDay: (number | null)[]; members: number; excluded: number; source: string; fetchedAt: string } | null;
  outlook6: { rows: { week: number; normalMm: number | null; prob: number | null; members: number }[]; source: string; fetchedAt: string } | null;
  weather: { source: string; fetchedAt: string | null };
  alertsSource: { source: string; fetchedAt: string | null };
  errors: { source: string; message: string; lastSuccessAt: string | null }[];
  items: AdviceItem[]; wording: string; facts: Fact[];
}

const ALERT_ICON = { frost: IconSnow, heavy_rain: IconRain, heatwave: IconSun };
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

export function TodayTab() {
  const f = useField();
  const { t, lang } = useApp();
  const { data, error, loading, reload } = useApi<AdviceResp>(`/api/fields/${f.id}/advice`, [f.version]);
  const [mm, setMm] = useState('');
  const [logMsg, setLogMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [logging, setLogging] = useState(false);

  const empty = !!data && !data.today;
  const d = data;
  const factById = (id: string) => d?.facts.find((x) => x.id === id);

  const logIrrigation = async () => {
    const v = parseFloat(mm);
    if (!(v > 0 && v <= 300)) { setLogMsg({ ok: false, text: 'Enter an amount between 1 and 300 mm.' }); return; }
    setLogging(true);
    try {
      await api(`/api/fields/${f.id}/irrigation`, { method: 'POST', json: { date: todayIst(), amountMm: v } });
      setLogMsg({ ok: true, text: `Logged ${v} mm for today. The balance has been recomputed.` });
      setMm('');
      reload();
      f.onFieldChanged();
    } catch (e) {
      setLogMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not log irrigation.' });
    } finally { setLogging(false); }
  };

  return (
    <TabState loading={loading} error={error} empty={empty} hasData={!!data && !empty}>
      {d && d.today && (
        <>
          <ErrorsBanner errors={d.errors} />
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-water-soft" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Irrigation decision · {fmtDate(d.today.date)}</p>
              <p className={cx('mt-1 text-3xl font-bold tracking-tight sm:text-4xl', d.decision?.kind === 'irrigate_now' ? 'text-water' : 'text-primary')} data-testid="decision">
                {d.decision?.kind === 'irrigate_now' && <IconDrop size={30} className="mr-2 inline -translate-y-1" />}
                {decisionText(t, d.decision, d.seasonComplete)}
              </p>
              <p className="mt-2 text-sm text-ink">
                Root-zone depletion <strong className="tabular-nums">{fmtMm(d.today.depletion)}</strong> · stress point (RAW) <strong className="tabular-nums">{fmtMm(d.raw)}</strong> · total available water <strong className="tabular-nums">{fmtMm(d.taw)}</strong>
              </p>
              <SourceLine source={d.weather.source} fetchedAt={d.weather.fetchedAt} staleHours={24} />
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-page" role="img" aria-label={`Depletion ${fmtMm(d.today.depletion)} of ${fmtMm(d.taw)}`}>
                <div className="h-full origin-left animate-grow rounded-full transition-[width] duration-200" style={{ width: `${Math.min(100, (d.today.depletion / (d.taw || 1)) * 100)}%`, background: d.today.depletion >= (d.raw ?? Infinity) ? '#2E7D9A' : '#7FB59A', animationName: 'none' }} />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted"><span>Field capacity</span><span>RAW {fmtMm(d.raw, 0)}</span><span>Wilting {fmtMm(d.taw, 0)}</span></div>
            </div>
            {f.owned && !d.seasonComplete && (
              <div className="relative mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
                <div>
                  <label htmlFor="irr" className="label">Irrigated today? Log it</label>
                  <input id="irr" type="number" min="1" max="300" step="1" className="input w-36" placeholder="mm" value={mm} onChange={(e) => setMm(e.target.value)} />
                </div>
                <Button variant="secondary" onClick={logIrrigation} disabled={logging}>{logging ? 'Saving…' : 'Log irrigation'}</Button>
                {logMsg && <p className={cx('w-full text-sm', logMsg.ok ? 'text-success' : 'text-danger')}>{logMsg.text}</p>}
              </div>
            )}
          </Card>

          {d.alerts.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {d.alerts.map((a) => {
                const Icon = ALERT_ICON[a.type];
                return (
                  <Card key={a.type} className="border-danger/30 bg-danger-soft/40">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-ctl bg-danger-soft text-danger"><Icon /></span>
                      <div>
                        <p className="font-semibold text-danger">{a.type === 'frost' ? 'Frost' : a.type === 'heavy_rain' ? 'Heavy rain' : 'Heatwave'} · {fmtDate(a.date)}</p>
                        <p className="text-sm">Forecast {a.value.toFixed(1)} {a.unit} · threshold {a.threshold} {a.type === 'heavy_rain' ? 'mm' : '°C'}</p>
                        <p className="mt-1 text-sm font-medium">{lang === 'hi' ? a.actionHi : a.action}</p>
                        <SourceLine source={d.alertsSource.source} fetchedAt={d.alertsSource.fetchedAt} staleHours={24} />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <Card>
            <CardTitle right={<Pill tone={d.wording === 'model' ? 'water' : 'neutral'}>{d.wording === 'model' ? <><IconSpark size={12} /> {t('aiWording')}</> : t('standardWording')}</Pill>}>{t('advice')}</CardTitle>
            {d.items.length === 0 ? <p className="text-sm text-muted">No advice items today.</p> : (
              <ul className="space-y-3">
                {d.items.map((it, i) => (
                  <li key={i} className="animate-fadeUp rounded-ctl border border-line p-3" style={{ animationDelay: `${i * 40}ms` }}>
                    <p className="font-semibold">{it.title[lang]}</p>
                    <p className={cx('mt-0.5 text-sm leading-relaxed', lang === 'hi' && 'font-deva')}>{it.text[lang]}</p>
                    <div className="mt-1.5 space-y-0.5">
                      {[...new Map(it.factIds.map(factById).filter((x): x is Fact => !!x && !!x.source && x.fetchedAt != null).map((x) => [x.source, x])).values()].map((x) => (
                        <SourceLine key={x.id} source={x.source} fetchedAt={x.fetchedAt} className="!mt-0" />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted"><IconAlert size={14} /> {t('decisionAid')}</p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle>{t('sevenDay')}</CardTitle>
              {d.outlook7 ? (
                <>
                  <div className="flex h-44 items-end gap-2" role="list">
                    {d.outlook7.probByDay.map((p, i) => (
                      <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" role="listitem" aria-label={`Day ${i + 1}: ${fmtPct(p)}`}>
                        <span className="text-[11px] font-semibold tabular-nums">{p == null ? '—' : `${Math.round(p * 100)}%`}</span>
                        <div className="w-full origin-bottom animate-grow rounded-t-md" style={{ height: `${Math.max(3, (p ?? 0) * 100)}%`, background: (p ?? 0) >= 0.6 ? '#2E7D9A' : '#A9CFDC', animationDelay: `${i * 25}ms` }} />
                        <span className="text-[11px] text-muted">{t('day')} {i + 1}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">{d.outlook7.members} ensemble members{d.outlook7.excluded ? `, ${d.outlook7.excluded} excluded for missing values` : ''}. Dark bars reach the 60% planning line.</p>
                  <SourceLine source={d.outlook7.source} fetchedAt={d.outlook7.fetchedAt} staleHours={24} />
                </>
              ) : <p className="text-sm text-muted">{d.seasonComplete ? 'Season complete.' : 'Ensemble outlook not available yet.'}</p>}
            </Card>
            <Card>
              <CardTitle>{t('sixWeek')}</CardTitle>
              {d.outlook6 ? (
                <>
                  <ul className="space-y-2.5">
                    {d.outlook6.rows.map((r) => (
                      <li key={r.week} className="grid grid-cols-[64px_1fr_56px] items-center gap-3 text-sm">
                        <span className="text-muted">{t('week')} {r.week}</span>
                        <div className="h-3 overflow-hidden rounded-full bg-page">
                          <div className="h-full origin-left animate-grow rounded-full" style={{ width: `${(r.prob ?? 0) * 100}%`, background: (r.prob ?? 0) >= 0.5 ? '#D9A441' : '#B9D6A8', transform: 'scaleX(1)' }} />
                        </div>
                        <span className="text-right font-semibold tabular-nums">{fmtPct(r.prob)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted">Normal = mean ERA5 rainfall for the same calendar week in past years. Week 2 normal: {fmtMm(d.outlook6.rows[0]?.normalMm)}.</p>
                  <SourceLine source={d.outlook6.source} fetchedAt={d.outlook6.fetchedAt} staleHours={24} />
                </>
              ) : <p className="text-sm text-muted">{d.seasonComplete ? 'Season complete.' : 'Weekly outlook not available yet.'}</p>}
            </Card>
          </div>
          <Link href={`/advisor?field=${f.id}`} className="no-print card card-hover flex items-center gap-3 p-4">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white"><IconChat size={20} /></span>
            <div><p className="font-semibold">{t('ask')}</p><p className="text-sm text-muted">“Should I irrigate this week?” · “पाला पड़ेगा क्या?”</p></div>
          </Link>
          {error && <Banner tone="warning">{error.message}</Banner>}
        </>
      )}
    </TabState>
  );
}
