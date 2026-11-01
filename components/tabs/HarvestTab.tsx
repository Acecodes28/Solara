'use client';

import { useApi } from '@/lib/hooks';
import { fmtDate, fmtNum, fmtPct, fmtRs } from '@/lib/format';
import { Banner, Card, CardTitle, Pill, SourceLine } from '../ui';
import { TabState, useField } from './common';

interface Resp {
  harvestStart: string; weekStarts: string[]; years: number; hasPrices: boolean; mandi: string | null;
  table: { week: number; startMonthDay: string; avgRainDays: number; avgNetValue: number | null; shareBest: number | null; years: number; priceYears: number }[];
  weatherSource: { source: string; fetchedAt: string | null }; priceSource: string | null;
}

export function HarvestTab() {
  const f = useField();
  const { data, error, loading } = useApi<Resp>(`/api/fields/${f.id}/harvest`, [f.version]);
  const empty = !!data && data.years === 0;
  const bestNet = Math.max(...(data?.table.map((r) => r.avgNetValue ?? -Infinity) ?? [0]));
  const maxRain = Math.max(1, ...(data?.table.map((r) => r.avgRainDays) ?? [1]));

  return (
    <TabState loading={loading} error={error} empty={empty} hasData={!!data && !empty} shape="table">
      {data && !empty && (
        <>
          {!data.hasPrices && <Banner tone="info">{data.mandi ? 'No price history stored for this mandi' : 'No mandi chosen'}, so only rain days are shown. Choose a mandi on the Market tab.</Banner>}
          <Card>
            <CardTitle right={<Pill>{data.years} past years</Pill>}>Candidate harvest weeks from {fmtDate(data.harvestStart)}</CardTitle>
            <div className="table-wrap">
              <table className="data-table stack-table">
                <thead><tr><th>Week starting</th><th>Avg rain days</th><th>Avg net value / q</th><th>Share of years best</th></tr></thead>
                <tbody>
                  {data.table.map((r, i) => (
                    <tr key={r.week} className={r.avgNetValue != null && r.avgNetValue === bestNet ? 'bg-success-soft/60' : ''}>
                      <td data-label="Week starting" className="font-medium">{fmtDate(data.weekStarts[i])}</td>
                      <td data-label="Avg rain days">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-1.5 w-14 overflow-hidden rounded-full bg-page"><span className="block h-full bg-water" style={{ width: `${(r.avgRainDays / maxRain) * 100}%` }} /></span>
                          {fmtNum(r.avgRainDays, 1)}
                        </span>
                      </td>
                      <td data-label="Avg net value / q">{r.avgNetValue == null ? '—' : fmtRs(r.avgNetValue, 0)}</td>
                      <td data-label="Share best">{fmtPct(r.shareBest)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted">Net value = modal price of the month × (1 − loss). Loss is <strong>modelled from rain days, not measured</strong>: 3% per rain day (≥1 mm), capped at 30%. The 3% factor is an assumption.</p>
            <SourceLine source={data.weatherSource.source} fetchedAt={data.weatherSource.fetchedAt} />
            {data.priceSource && <SourceLine source={data.priceSource} fetchedAt={null} />}
          </Card>
        </>
      )}
    </TabState>
  );
}
