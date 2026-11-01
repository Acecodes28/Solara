'use client';

import { PageHeader } from '@/components/AppShell';
import { Banner, Card, Pill, SkeletonRows, cx } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { useApp } from '@/lib/i18n/context';
import { ageLabel, fmtDateTime } from '@/lib/format';

interface Source { name: string; state: 'ok' | 'stale' | 'failed' | 'not_configured'; last_success_at: string | null; age_hours: number | null; last_error: string | null; last_error_at: string | null; credit: string; setup: string | null }
interface Resp { status: string; sources: Source[]; ai_configured: boolean; satellite_configured: boolean; checked_at: string }

const STATE = {
  ok: { label: 'OK', tone: 'success' as const, dot: 'bg-success' },
  stale: { label: 'Stale', tone: 'warning' as const, dot: 'bg-warning' },
  failed: { label: 'Failed', tone: 'danger' as const, dot: 'bg-danger' },
  not_configured: { label: 'Not configured', tone: 'neutral' as const, dot: 'bg-line' },
};

export default function HealthPage() {
  const { t } = useApp();
  const { data, loading, error } = useApi<Resp>('/api/health');
  return (
    <div className="animate-fadeUp">
      <PageHeader title={t('health_title')} subtitle={t('health_sub')} />
      {error && <Banner tone="danger">{error.message}</Banner>}
      {loading && !data ? <Card><SkeletonRows rows={8} /></Card> : data && (
        <>
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            <Pill tone={data.ai_configured ? 'success' : 'neutral'}>Solara AI wording: {data.ai_configured ? 'Gemini configured' : 'standard templates'}</Pill>
            <Pill tone={data.satellite_configured ? 'success' : 'neutral'}>Satellite: {data.satellite_configured ? 'configured' : 'not configured'}</Pill>
            <span className="text-xs text-muted">Checked {fmtDateTime(data.checked_at)}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {data.sources.map((s, i) => (
              <Card key={s.name} className="animate-fadeUp" style={{ animationDelay: `${i * 25}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={cx('h-2.5 w-2.5 rounded-full', STATE[s.state].dot)} />
                    <h2 className="font-semibold">{s.name}</h2>
                  </div>
                  <Pill tone={STATE[s.state].tone}>{STATE[s.state].label}</Pill>
                </div>
                <p className="mt-2 text-sm">
                  {s.last_success_at ? <>Last success {fmtDateTime(s.last_success_at)} · age {s.age_hours?.toFixed(1)} h</> : s.state === 'not_configured' ? 'No credentials set.' : 'Not fetched yet.'}
                </p>
                {s.last_error && s.state === 'failed' && <p className="mt-1 text-sm text-danger">Error {ageLabel(s.last_error_at)}: {s.last_error}</p>}
                {s.setup && <p className="mt-2 rounded-ctl bg-page px-3 py-2 text-xs text-ink">Setup: {s.setup}</p>}
                <p className="mt-2 text-xs text-muted">{s.credit}</p>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">Staleness limits: weather 24 h, satellite 7 days, prices 60 days, soil 365 days. Stale values still display with a badge and their age.</p>
        </>
      )}
    </div>
  );
}
