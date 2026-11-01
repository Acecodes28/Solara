'use client';

import { useApi } from '@/lib/hooks';
import { fmtNum, fmtPct, fmtRs } from '@/lib/format';
import { Banner, Card, CardTitle, Pill, Stat, cx } from '../ui';
import { IconCheck, IconX } from '../icons';
import { TabState, useField } from './common';

interface Resp {
  stress: { status: string; n: number; validation: { brier: number; baseline: number; skill: number | null; n: number } | null; seasons: { year: number; predicted: number; stressFlag: 0 | 1; criticalStressDays: number; match: boolean }[] };
  price: { status: 'no_mandi' | 'no_prices' } | {
    status: 'ok'; rows: { year: number; recommendation: 'hold' | 'sell' | null; h: number | null; harvestPrice: number; realisedPrice: number | null; diffPerQ: number | null; diffField: number | null }[];
    sellMonth: number; totalDiffField: number; meanDiffPerQ: number | null; source: string; minYears: number;
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function BacktestTab() {
  const f = useField();
  const { data, error, loading } = useApi<Resp>(`/api/fields/${f.id}/backtest`, [f.version]);
  const empty = !!data && data.stress.status === 'no_data';
  const v = data?.stress.validation;
  const matches = data?.stress.seasons.filter((s) => s.match).length ?? 0;

  return (
    <TabState loading={loading} error={error} empty={empty} hasData={!!data && !empty} shape="table">
      {data && !empty && (
        <>
          <Card>
            <CardTitle>Stress prediction against what happened</CardTitle>
            {v ? (
              <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Brier score" value={fmtNum(v.brier, 3)} />
                <Stat label="Baseline" value={fmtNum(v.baseline, 3)} />
                <Stat label="Skill" value={v.skill == null ? '—' : fmtNum(v.skill, 2)} />
                <Stat label="Seasons" value={v.n} sub={`${matches} of ${data.stress.seasons.length} matched at 50%`} />
              </div>
            ) : <Banner tone="info">Not enough history yet: {data.stress.n} of 10 seasons.</Banner>}
            <div className="table-wrap">
              <table className="data-table stack-table">
                <thead><tr><th>Season</th><th>Predicted chance</th><th>Mid-stage stress days</th><th>Outcome</th><th>Match</th></tr></thead>
                <tbody>
                  {data.stress.seasons.map((s) => (
                    <tr key={s.year}>
                      <td data-label="Season" className="font-semibold">{s.year}</td>
                      <td data-label="Predicted">{fmtPct(s.predicted)}</td>
                      <td data-label="Stress days">{s.criticalStressDays}</td>
                      <td data-label="Outcome">{s.stressFlag ? <Pill tone="danger">Stressed</Pill> : <Pill tone="success">No stress</Pill>}</td>
                      <td data-label="Match">{s.match ? <IconCheck className="text-success" /> : <IconX className="text-danger" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">Each season is predicted from all the others (leave one season out), using the state on today’s day of season.</p>
          </Card>

          <Card>
            <CardTitle>Sell-or-hold advice against selling at harvest</CardTitle>
            {data.price.status !== 'ok' ? (
              <p className="text-sm text-muted">{data.price.status === 'no_mandi' ? 'Choose a mandi on the Market tab to backtest price advice.' : 'No price history stored for this mandi.'}</p>
            ) : data.price.rows.length === 0 ? (
              <p className="text-sm text-muted">Not enough price years yet (each backtest year needs {data.price.minYears} earlier years).</p>
            ) : (
              <>
                <p className={cx('text-2xl font-bold', data.price.totalDiffField >= 0 ? 'text-success' : 'text-danger')}>{fmtRs(data.price.totalDiffField, 0)}</p>
                <p className="text-sm text-muted">Total difference for this field across {data.price.rows.length} years versus selling in {MONTHS[data.price.sellMonth - 1]}.</p>
                <div className="table-wrap mt-3">
                  <table className="data-table stack-table">
                    <thead><tr><th>Year</th><th>Advice</th><th>Harvest price</th><th>Realised</th><th>Difference / q</th><th>Field</th></tr></thead>
                    <tbody>
                      {data.price.rows.map((r) => (
                        <tr key={r.year}>
                          <td data-label="Year" className="font-semibold">{r.year}</td>
                          <td data-label="Advice">{r.recommendation === 'hold' ? `Hold ${r.h} mo` : 'Sell'}</td>
                          <td data-label="Harvest price">{fmtRs(r.harvestPrice, 0)}</td>
                          <td data-label="Realised">{fmtRs(r.realisedPrice, 0)}</td>
                          <td data-label="Diff / q" className={(r.diffPerQ ?? 0) >= 0 ? 'text-success' : 'text-danger'}>{fmtRs(r.diffPerQ)}</td>
                          <td data-label="Field">{fmtRs(r.diffField, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </TabState>
  );
}
