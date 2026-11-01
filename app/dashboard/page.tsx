'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/AppShell';
import { FieldsMap, type MapField } from '@/components/maps';
import { FieldTable } from '@/components/FieldTable';
import { Banner, ButtonLink, Card, CardTitle, EmptyState, RISK_COLOR, SkeletonRows, riskLevel } from '@/components/ui';
import { IconPlus } from '@/components/icons';
import { decisionText } from '@/components/fieldText';
import { useApi, type FieldListItem } from '@/lib/hooks';
import { useApp } from '@/lib/i18n/context';
import { fmtDateTime, fmtPct } from '@/lib/format';

export default function DashboardPage() {
  const { t } = useApp();
  const router = useRouter();
  const { data, error, loading } = useApi<{ fields: FieldListItem[] }>('/api/fields');
  const fields = data?.fields ?? [];
  const mapFields: MapField[] = fields.map((f) => {
    const p = f.summary?.stressProb ?? null;
    return { id: f.id, name: f.name, color: RISK_COLOR[riskLevel(p)], label: `${t(f.crop)} · ${p == null ? t('risk_none') : fmtPct(p)} · ${decisionText(t, f.summary?.decision, f.summary?.seasonComplete)}`, centroid: f.centroid, polygon: f.polygon };
  });
  const errs = fields.flatMap((f) => f.summary?.errors ?? []);
  const uniqueErrs = [...new Map(errs.map((e) => [e.source, e])).values()];

  return (
    <div className="animate-fadeUp">
      <PageHeader title={t('dash_title')} subtitle={t('dash_sub')} actions={<ButtonLink href="/fields/new" className="hidden sm:inline-flex"><IconPlus size={18} /> {t('addField')}</ButtonLink>} />
      {error && <div className="mb-4"><Banner tone="danger">Could not load fields: {error.message}</Banner></div>}
      {uniqueErrs.map((e) => (
        <div className="mb-3" key={e.source}>
          <Banner tone="danger"><strong>{e.source}</strong> failed. {e.lastSuccessAt ? `Showing saved results from ${fmtDateTime(e.lastSuccessAt)}.` : 'No saved results yet.'}</Banner>
        </div>
      ))}
      {loading && !data ? (
        <Card><SkeletonRows rows={5} /></Card>
      ) : fields.length === 0 ? (
        <EmptyState message={t('dash_empty')}><ButtonLink href="/fields/new"><IconPlus size={18} /> {t('addField')}</ButtonLink></EmptyState>
      ) : (
        <div className="space-y-4">
          <Card className="overflow-hidden !p-0">
            <FieldsMap fields={mapFields} onSelect={(id) => router.push(`/fields/${id}`)} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5 text-xs text-muted">
              {(['low', 'medium', 'high', 'none'] as const).map((l) => (
                <span key={l} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: RISK_COLOR[l] }} />
                  {t(`risk_${l}`)} {l === 'low' ? '(<25%)' : l === 'medium' ? '(25–49%)' : l === 'high' ? '(≥50%)' : ''}
                </span>
              ))}
            </div>
          </Card>
          <Card>
            <CardTitle>{t('fields_title')} ({fields.length})</CardTitle>
            <FieldTable fields={fields} />
          </Card>
        </div>
      )}
    </div>
  );
}
