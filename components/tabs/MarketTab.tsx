'use client';

import { useEffect, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { useApi } from '@/lib/hooks';
import { api, ApiError } from '@/lib/client';
import { fmtDate, fmtNum, fmtPct, fmtRs } from '@/lib/format';
import { Banner, Button, Card, CardTitle, EmptyState, Pill, SourceLine, Stat, cx } from '../ui';
import { TabState, useField } from './common';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Resp {
  status: 'no_mandi' | 'no_prices' | 'ok'; commodity: string; mandi: string | null; source: string | null; fetchedAt: string | null;
  decisionMonth: { year: number; month: number; isCurrent: boolean } | null;
  last12: { label: string; year: number; month: number; price: number | null; pastYears: number[] }[];
  result: {
    status: 'ok' | 'insufficient'; yearsAvailable: number; p0: number | null; percentile: number | null;
    horizons: { h: number; expectedGain: number; hitRate: number; years: number }[];
    recommendation: 'hold' | 'sell' | null; bestH: number | null; bestGainPerQ: number | null; bestGainTotal: number | null; quantityQ: number;
  } | null;
  assumptions: { yieldQPerHa: number; yieldIsDefault: boolean; storageCost: number; interestPct: number; quantityQ: number };
  live: { market: string; date: string; modal: number; fetchedAt: string } | null;
  liveError: string | null;
}

export function MandiPicker({ commodity, current, onSaved }: { commodity: string; current: string | null; onSaved: () => void }) {
  const f = useField();
  const [options, setOptions] = useState<{ mandi: string; district: string | null; years: number }[] | null>(null);
  const [value, setValue] = useState(current ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api<{ commodities: { commodity: string; mandis: { mandi: string; district: string | null; years: number }[] }[] }>('/api/market/commodities')
      .then((r) => setOptions(r.commodities.find((c) => c.commodity === commodity)?.mandis ?? [])).catch(() => setOptions([]));
  }, [commodity]);
  if (!f.owned) return null;
  const save = async () => {
    try {
      await api(`/api/fields/${f.id}`, { method: 'PATCH', json: { mandi: value || null } });
      setMsg(null);
      onSaved();
      f.onFieldChanged();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Could not save.'); }
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1">
        <label className="label" htmlFor="mandi-pick">Mandi for this field</label>
        <select id="mandi-pick" className="input" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">No mandi</option>
          {(options ?? []).map((o) => <option key={o.mandi} value={o.mandi}>{o.mandi}{o.district ? ` (${o.district})` : ''} · {o.years} years</option>)}
        </select>
      </div>
      <Button variant="secondary" onClick={save} disabled={value === (current ?? '')}>Save mandi</Button>
      {options && options.length === 0 && <p className="w-full text-xs text-muted">No price history stored for {commodity} yet. Import CEDA CSVs or add a CEDA key on the server (see Data Health).</p>}
      {msg && <p className="field-error w-full">{msg}</p>}
    </div>
  );
}

export function MarketTab() {
  const f = useField();
  const { data, error, loading, reload } = useApi<Resp>(`/api/fields/${f.id}/market`, [f.version]);
  const [yieldQ, setYieldQ] = useState('');
  const [storage, setStorage] = useState('');
  const [interest, setInterest] = useState('');
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!data) return;
    setYieldQ(String(data.assumptions.yieldQPerHa));
    setStorage(String(data.assumptions.storageCost));
    setInterest(String(data.assumptions.interestPct));
  }, [data]);

  const saveAssumptions = async () => {
    try {
      await api(`/api/fields/${f.id}`, { method: 'PATCH', json: { expectedYieldQPerHa: parseFloat(yieldQ), storageCostPerQMonth: parseFloat(storage), interestPctYear: parseFloat(interest) } });
      setSaveMsg({ ok: true, text: 'Assumptions saved. Results recalculated.' });
      reload();
      f.onFieldChanged();
    } catch (e) { setSaveMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not save.' }); }
  };

  if (data && data.status !== 'ok') {
    return (
      <div className="animate-fadeUp space-y-4">
        <EmptyState message={data.status === 'no_mandi' ? 'Choose a mandi for this field to compare prices across past years.' : 'No price history stored for this mandi.'} />
        <Card><MandiPicker commodity={data.commodity} current={data.mandi} onSaved={reload} /></Card>
      </div>
    );
  }

  const r = data?.result;
  const chart = (data?.last12 ?? []).map((m) => ({ label: m.label, price: m.price, ...Object.fromEntries(m.pastYears.map((p, i) => [`p${i}`, p])) }));
  const pastPoints = (data?.last12 ?? []).flatMap((m) => m.pastYears.map((p) => ({ label: m.label, past: p })));

  return (
    <TabState loading={loading} error={error} empty={false} hasData={!!data} shape="chart">
      {data && r && (
        <>
          <Card>
            <CardTitle right={<Pill>{data.mandi}</Pill>}>Last 12 months of modal price</CardTitle>
            <div className="h-64">
              <ResponsiveContainer>
                <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke="#EEF2EA" vertical={false} />
                  <XAxis dataKey="label" allowDuplicatedCategory={false} tick={{ fontSize: 11, fill: '#5B6B5E' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#5B6B5E' }} tickFormatter={(v) => `₹${v}`} width={64} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => fmtRs(v, 0)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Scatter data={pastPoints} dataKey="past" name="Same month, past years" fill="#C9B79C" isAnimationActive={false} />
                  <Line dataKey="price" name="This year" stroke="#7A5230" strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive animationDuration={200} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <SourceLine source={data.source ?? 'CEDA'} fetchedAt={data.fetchedAt} staleHours={24 * 60} />
            {data.live && <p className="mt-2 text-sm"><Pill tone="water">Live reading</Pill> {data.live.market}: {fmtRs(data.live.modal, 0)}/q on {fmtDate(data.live.date)} <span className="text-xs text-muted">(data.gov.in Agmarknet; not used in the recommendation)</span></p>}
            {data.liveError && <p className="mt-2 text-xs text-muted">Live reading unavailable: {data.liveError}</p>}
          </Card>

          <Card className={cx(r.recommendation === 'hold' && 'border-success/40', r.recommendation === 'sell' && 'border-accent/40')}>
            <CardTitle>Sell or hold</CardTitle>
            {r.status === 'insufficient' ? (
              <Banner tone="info">Not enough price history for this month: {r.yearsAvailable} of 8 years.</Banner>
            ) : (
              <>
                <p className={cx('text-3xl font-bold', r.recommendation === 'hold' ? 'text-success' : 'text-accent')}>
                  {r.recommendation === 'hold' ? `Hold ${r.bestH} month${r.bestH === 1 ? '' : 's'}` : 'Sell'}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Decision month {MONTHS[(data.decisionMonth?.month ?? 1) - 1]} {data.decisionMonth?.year}{data.decisionMonth && !data.decisionMonth.isCurrent ? ' (latest stored month)' : ''}: modal price {fmtRs(r.p0)}/q, higher than {fmtPct(r.percentile)} of past years for this month.
                </p>
                {r.bestGainTotal != null && r.recommendation === 'hold' && <p className="mt-2 text-sm">Expected gain for this field: <strong>{fmtRs(r.bestGainTotal)}</strong> ({fmtRs(r.bestGainPerQ)}/q × {fmtNum(r.quantityQ, 1)} q)</p>}
                <div className="table-wrap mt-3">
                  <table className="data-table">
                    <thead><tr><th>Hold</th><th>Expected gain / q</th><th>Hit rate</th><th>Years</th></tr></thead>
                    <tbody>
                      {r.horizons.map((h) => (
                        <tr key={h.h} className={h.h === r.bestH ? 'bg-primary-soft/50' : ''}>
                          <td>{h.h} month{h.h === 1 ? '' : 's'}</td>
                          <td className={h.expectedGain > 0 ? 'text-success' : 'text-danger'}>{fmtRs(h.expectedGain)}</td>
                          <td>{fmtPct(h.hitRate)}</td>
                          <td>{h.years}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-muted">Hold is recommended only when some horizon has a positive expected gain and a hit rate of at least 60%, after storage and interest. {`Decision aid. Not financial advice.`}</p>
              </>
            )}
          </Card>

          {f.owned && (
            <Card>
              <CardTitle right={<Pill tone="warning">Assumptions</Pill>}>Your numbers</CardTitle>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><label className="label" htmlFor="yq">Expected yield (q/ha)</label><input id="yq" type="number" min="1" max="60" step="0.5" className="input" value={yieldQ} onChange={(e) => setYieldQ(e.target.value)} />{data.assumptions.yieldIsDefault && <p className="mt-1 text-xs text-muted">assumption, enter your own</p>}</div>
                <div><label className="label" htmlFor="sc">Storage cost (₹/q/month)</label><input id="sc" type="number" min="0" max="200" className="input" value={storage} onChange={(e) => setStorage(e.target.value)} /></div>
                <div><label className="label" htmlFor="ir">Interest rate (%/year)</label><input id="ir" type="number" min="0" max="30" step="0.5" className="input" value={interest} onChange={(e) => setInterest(e.target.value)} /></div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3"><Button variant="secondary" onClick={saveAssumptions}>Recalculate</Button>{saveMsg && <span className={cx('text-sm', saveMsg.ok ? 'text-success' : 'text-danger')}>{saveMsg.text}</span>}</div>
              <div className="mt-4 border-t border-line pt-4"><MandiPicker commodity={data.commodity} current={data.mandi} onSaved={reload} /></div>
            </Card>
          )}
          <Stat label="Quantity used" value={`${fmtNum(data.assumptions.quantityQ, 1)} q`} sub="area × expected yield" />
        </>
      )}
    </TabState>
  );
}
