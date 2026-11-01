'use client';

import Link from 'next/link';
import { ResponsiveContainer, ComposedChart, Area, Line, Scatter, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useApi } from '@/lib/hooks';
import { useApp } from '@/lib/i18n/context';
import { fmtNum } from '@/lib/format';
import { Banner, Card, CardTitle, Pill, SourceLine, Stat } from '../ui';
import { TabState, useField } from './common';

interface Resp {
  configured: boolean; status: 'not_configured' | 'no_data' | 'ok';
  season: { day: number; date: string; ndvi: number }[];
  band: { day: number; p25: number; p75: number; n: number }[];
  latest: { day: number; date: string; ndvi: number } | null;
  latestBand: { p25: number; p75: number } | null;
  verdict: string | null; verdictText: { en: string; hi: string } | null;
  clearImages21: number; totalObservations: number; source: string; fetchedAt: string | null; stressProb: number | null;
}

export function SatelliteTab() {
  const f = useField();
  const { lang } = useApp();
  const { data, error, loading } = useApi<Resp>(`/api/fields/${f.id}/satellite`, [f.version]);

  if (data?.status === 'not_configured') {
    return (
      <Card className="animate-fadeUp">
        <CardTitle>Satellite not configured</CardTitle>
        <p className="text-sm text-muted">Sentinel-2 vegetation statistics need free Copernicus Data Space credentials. Once the server has them, refresh this field to fetch its satellite history from 2017.</p>
        <Link href="/health" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">See the setup note on Data Health</Link>
      </Card>
    );
  }

  const empty = !!data && data.totalObservations === 0;
  const merged = new Map<number, { day: number; band?: [number, number]; ndvi?: number }>();
  for (const b of data?.band ?? []) merged.set(b.day, { day: b.day, band: [b.p25, b.p75] });
  for (const s of data?.season ?? []) merged.set(s.day, { ...(merged.get(s.day) ?? { day: s.day }), ndvi: s.ndvi });
  const chart = [...merged.values()].sort((a, b) => a.day - b.day);

  return (
    <TabState loading={loading} error={error} empty={empty} hasData={!!data && !empty} shape="chart">
      {data && !empty && (
        <>
          {data.verdict === 'no_clear_image' ? <Banner tone="warning">No clear satellite image in the last 21 days.</Banner>
            : data.verdictText && <Banner tone={data.verdict === 'agrees_below' || data.verdict === 'unexplained_stress' ? 'danger' : 'success'}>{data.verdictText[lang]}</Banner>}
          <Card>
            <CardTitle right={<Pill>{data.clearImages21} clear image{data.clearImages21 === 1 ? '' : 's'} in 21 days</Pill>}>Vegetation index (NDVI) this season</CardTitle>
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="#EEF2EA" vertical={false} />
                  <XAxis dataKey="day" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 11, fill: '#5B6B5E' }} label={{ value: 'day of season', fontSize: 11, fill: '#5B6B5E', position: 'insideBottomRight', offset: -2 }} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: '#5B6B5E' }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number | number[]) => (Array.isArray(v) ? `${v[0].toFixed(2)}–${v[1].toFixed(2)}` : v.toFixed(2))} />
                  <Area dataKey="band" name="Past seasons P25–P75" stroke="none" fill="#B9D6A8" fillOpacity={0.5} connectNulls isAnimationActive animationDuration={200} />
                  <Line dataKey="ndvi" name="This season" stroke="#1F4D2B" strokeWidth={2} connectNulls dot={{ r: 3 }} isAnimationActive animationDuration={200} />
                  <Scatter dataKey="ndvi" fill="#1F4D2B" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <Stat label="Latest clear value" value={fmtNum(data.latest?.ndvi, 2)} sub={data.latest ? `day ${data.latest.day}` : 'none this season'} />
              <Stat label="Normal band" value={data.latestBand ? `${fmtNum(data.latestBand.p25, 2)}–${fmtNum(data.latestBand.p75, 2)}` : '—'} />
              <Stat label="Observations" value={data.totalObservations} sub="since 2017" />
            </div>
            <SourceLine source={data.source} fetchedAt={data.fetchedAt} staleHours={24 * 7} />
          </Card>
        </>
      )}
    </TabState>
  );
}
