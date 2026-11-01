'use client';

import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, Legend } from 'recharts';
import { useApi } from '@/lib/hooks';
import { useApp } from '@/lib/i18n/context';
import { fmtDate, fmtMm, fmtNum } from '@/lib/format';
import { Card, CardTitle, ErrorsBanner, Pill, SourceLine } from '../ui';
import { stageText } from '../fieldText';
import { TabState, useField } from './common';

interface Day { date: string; stage: string; kc: number; etc_mm: number | null; ks: number; depletion_mm: number; raw_mm: number; taw_mm: number; irrigation_mm: number; precip_mm: number | null; gap: boolean }
interface Resp {
  days: Day[]; taw: number | null; raw: number | null; gapCount: number; stageStarts: { development: number; mid: number; late: number };
  soil: { sandPct: number; clayPct: number; socPct: number; omPct: number; awc: number; source: string; fetchedAt: string } | null;
  weather: { source: string; fetchedAt: string | null } | null;
  errors: { source: string; message: string; lastSuccessAt: string | null }[];
}

export function WaterTab() {
  const f = useField();
  const { t } = useApp();
  const { data, error, loading } = useApi<Resp>(`/api/fields/${f.id}/balance`, [f.version]);
  const empty = !!data && data.days.length === 0;
  const days = data?.days ?? [];
  const chart = days.map((d) => ({ date: d.date.slice(5), depletion: +d.depletion_mm.toFixed(1), rain: d.precip_mm ?? 0, irrigation: d.irrigation_mm || null }));
  const stageDates = data ? (['development', 'mid', 'late'] as const).map((s) => ({ s, d: days[data.stageStarts[s]]?.date.slice(5) })).filter((x) => x.d) : [];

  return (
    <TabState loading={loading} error={error} empty={empty} hasData={!!data && !empty} shape="chart">
      {data && !empty && (
        <>
          <ErrorsBanner errors={data.errors} />
          <Card>
            <CardTitle right={data.gapCount > 0 ? <Pill tone="warning">{data.gapCount} gap day{data.gapCount === 1 ? '' : 's'}</Pill> : <Pill tone="success">No gaps</Pill>}>Root-zone depletion since sowing</CardTitle>
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#EEF2EA" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5B6B5E' }} minTickGap={24} />
                  <YAxis reversed tick={{ fontSize: 11, fill: '#5B6B5E' }} unit=" mm" width={64} />
                  <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#E3E8DF', fontSize: 12 }} formatter={(v: number, n: string) => [`${v} mm`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="rain" name="Rain" fill="#A9CFDC" barSize={3} isAnimationActive animationDuration={200} />
                  <Bar dataKey="irrigation" name="Irrigation" fill="#2E7D9A" barSize={4} isAnimationActive animationDuration={200} />
                  <Line dataKey="depletion" name="Depletion" stroke="#1F4D2B" strokeWidth={2} dot={false} isAnimationActive animationDuration={200} />
                  {data.raw != null && <ReferenceLine y={data.raw} stroke="#D9A441" strokeDasharray="5 4" label={{ value: `RAW ${data.raw.toFixed(0)} mm`, fontSize: 11, fill: '#7A5410', position: 'insideTopRight' }} />}
                  {data.taw != null && <ReferenceLine y={data.taw} stroke="#B71C1C" strokeDasharray="5 4" label={{ value: `TAW ${data.taw.toFixed(0)} mm`, fontSize: 11, fill: '#B71C1C', position: 'insideBottomRight' }} />}
                  {stageDates.map((x) => <ReferenceLine key={x.s} x={x.d} stroke="#9AA59C" strokeDasharray="2 4" label={{ value: stageText(t, x.s), fontSize: 10, fill: '#5B6B5E', position: 'insideTopLeft' }} />)}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-xs text-muted">Depletion grows downward. Above the amber RAW line the crop is unstressed; between RAW and TAW water uptake falls (Ks &lt; 1).</p>
            {data.weather && <SourceLine source={data.weather.source} fetchedAt={data.weather.fetchedAt} staleHours={24} />}
          </Card>

          <Card>
            <CardTitle>Last 14 days</CardTitle>
            <div className="table-wrap">
              <table className="data-table stack-table">
                <thead><tr><th>Date</th><th>Stage</th><th>Rain</th><th>Irrigation</th><th>Kc</th><th>ETc</th><th>Ks</th><th>Depletion</th></tr></thead>
                <tbody>
                  {days.slice(-14).reverse().map((d) => (
                    <tr key={d.date}>
                      <td data-label="Date">{fmtDate(d.date)}</td>
                      <td data-label="Stage">{stageText(t, d.stage)}</td>
                      <td data-label="Rain">{d.gap ? <Pill tone="warning">gap</Pill> : fmtMm(d.precip_mm)}</td>
                      <td data-label="Irrigation">{d.irrigation_mm ? fmtMm(d.irrigation_mm) : '—'}</td>
                      <td data-label="Kc">{fmtNum(d.kc, 2)}</td>
                      <td data-label="ETc">{fmtMm(d.etc_mm)}</td>
                      <td data-label="Ks">{fmtNum(d.ks, 2)}</td>
                      <td data-label="Depletion" className="font-semibold">{fmtMm(d.depletion_mm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {data.soil && (
            <Card>
              <CardTitle>Soil (0–30 cm)</CardTitle>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                {[['Sand', `${data.soil.sandPct.toFixed(1)}%`], ['Clay', `${data.soil.clayPct.toFixed(1)}%`], ['Organic carbon', `${data.soil.socPct.toFixed(2)}%`], ['Available water', `${data.soil.awc.toFixed(1)} mm/m`], ['TAW / RAW', `${fmtMm(data.taw, 0)} / ${fmtMm(data.raw, 0)}`]].map(([k, v]) => (
                  <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>
                ))}
              </dl>
              <SourceLine source={data.soil.source} fetchedAt={data.soil.fetchedAt} staleHours={24 * 365} />
            </Card>
          )}
        </>
      )}
    </TabState>
  );
}
