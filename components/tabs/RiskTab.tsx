'use client';

import { useApi } from '@/lib/hooks';
import { fmtNum, fmtPct } from '@/lib/format';
import { Banner, Card, CardTitle, ErrorsBanner, Pill, RiskBadge, SourceLine, Stat, riskLevel, RISK_COLOR } from '../ui';
import { TabState, useField } from './common';

interface Resp {
  risk: {
    status: 'ok' | 'insufficient' | 'no_data'; prob: number | null; n: number;
    current: { depletionRatio: number; stressDays: number } | null;
    similar: { year: number; depletionRatio: number; stressDays: number; weight: number; stressFlag: 0 | 1; criticalStressDays: number; looProb: number | null }[];
    validation: { brier: number; baseline: number; skill: number | null; n: number } | null;
  } | null;
  minSeasons: number; dayOfSeason: number | null; seasonComplete: boolean;
  weather: { source: string; fetchedAt: string | null } | null;
  errors: { source: string; message: string; lastSuccessAt: string | null }[];
}

export function RiskTab() {
  const f = useField();
  const { data, error, loading } = useApi<Resp>(`/api/fields/${f.id}/risk`, [f.version]);
  const r = data?.risk;
  const empty = !!data && (!r || r.status === 'no_data');

  return (
    <TabState loading={loading} error={error} empty={empty} hasData={!!r && !empty}>
      {data && r && r.status !== 'no_data' && (
        <>
          <ErrorsBanner errors={data.errors} />
          {r.status === 'insufficient' ? (
            <Banner tone="info">Not enough history yet: {r.n} of {data.minSeasons} seasons.</Banner>
          ) : (
            <Card className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
              <div className="relative mx-auto h-40 w-40">
                <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#EEF2EA" strokeWidth="12" />
                  <circle cx="60" cy="60" r="50" fill="none" stroke={RISK_COLOR[riskLevel(r.prob)]} strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={`${(r.prob ?? 0) * 314.16} 314.16`} style={{ transition: 'stroke-dasharray 200ms ease-out' }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold tabular-nums">{fmtPct(r.prob)}</span>
                  <span className="text-xs text-muted">stress chance</span>
                </div>
              </div>
              <div>
                <p className="text-lg font-semibold">Chance of a water-stress period in the critical (mid) stage this season</p>
                <p className="mt-1 text-sm text-muted">Based on {r.n} past seasons at this location, weighted by how closely each matched today’s state on day {data.dayOfSeason} (depletion {fmtPct(r.current?.depletionRatio)} of TAW, {r.current?.stressDays ?? 0} mid-stage stress days so far). A season counts as stressed with 5 or more mid-stage days below Ks = 1.</p>
                <div className="mt-2"><RiskBadge p={r.prob} /></div>
                <p className="mt-2 text-xs text-muted">This predicts water stress in the critical stage, not yield.</p>
                {data.weather && <SourceLine source="Analog model on Open-Meteo ERA5 archive" fetchedAt={data.weather.fetchedAt} />}
              </div>
            </Card>
          )}

          {r.validation && (
            <Card>
              <CardTitle>How reliable this has been (leave one season out)</CardTitle>
              <div className="grid grid-cols-3 gap-4">
                <Stat label="Brier score" value={fmtNum(r.validation.brier, 3)} sub="lower is better" />
                <Stat label="Baseline" value={fmtNum(r.validation.baseline, 3)} sub="always the base rate" />
                <Stat label="Skill" value={r.validation.skill == null ? '—' : fmtNum(r.validation.skill, 2)} sub={r.validation.skill == null ? 'baseline is perfect' : r.validation.skill > 0 ? 'better than baseline' : 'not better than baseline'} />
              </div>
              {r.validation.skill != null && r.validation.skill <= 0 && (
                <p className="mt-3 text-sm text-warning-text">At this location the analog method has not beaten the simple base rate in past seasons. Treat the chance as a rough guide.</p>
              )}
            </Card>
          )}

          <Card>
            <CardTitle>Most similar past seasons</CardTitle>
            <div className="table-wrap">
              <table className="data-table stack-table">
                <thead><tr><th>Season</th><th>Similarity</th><th>Depletion then</th><th>Stress days then</th><th>Final mid-stage stress days</th><th>Outcome</th></tr></thead>
                <tbody>
                  {r.similar.slice(0, 10).map((s) => (
                    <tr key={s.year}>
                      <td data-label="Season" className="font-semibold">{s.year}</td>
                      <td data-label="Similarity">
                        <span className="inline-flex items-center gap-2"><span className="h-1.5 w-16 overflow-hidden rounded-full bg-page"><span className="block h-full bg-primary" style={{ width: `${s.weight * 100}%` }} /></span>{fmtNum(s.weight, 2)}</span>
                      </td>
                      <td data-label="Depletion then">{fmtPct(s.depletionRatio)}</td>
                      <td data-label="Stress days then">{s.stressDays}</td>
                      <td data-label="Final stress days">{s.criticalStressDays}</td>
                      <td data-label="Outcome">{s.stressFlag ? <Pill tone="danger">Stressed</Pill> : <Pill tone="success">No stress</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </TabState>
  );
}
