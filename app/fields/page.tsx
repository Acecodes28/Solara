'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/AppShell';
import { ButtonLink, Card, CardTitle, EmptyState, RiskBadge, SkeletonRows, Pill } from '@/components/ui';
import { IconCompare, IconPlus } from '@/components/icons';
import { decisionText, stageText } from '@/components/fieldText';
import { useApi, type FieldListItem } from '@/lib/hooks';
import { useApp } from '@/lib/i18n/context';
import { fmtDate, fmtMm, fmtNum } from '@/lib/format';

export default function FieldsPage() {
  const { t } = useApp();
  const { data, loading } = useApi<{ fields: FieldListItem[] }>('/api/fields');
  const fields = data?.fields ?? [];
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const fa = fields.find((f) => f.id === a);
  const fb = fields.find((f) => f.id === b);

  return (
    <div className="animate-fadeUp">
      <PageHeader title={t('fields_title')} subtitle={t('fields_sub')} actions={<ButtonLink href="/fields/new" className="hidden sm:inline-flex"><IconPlus size={18} /> {t('addField')}</ButtonLink>} />
      {loading && !data ? <Card><SkeletonRows /></Card> : fields.length === 0 ? (
        <EmptyState message={t('dash_empty')}><ButtonLink href="/fields/new"><IconPlus size={18} /> {t('addField')}</ButtonLink></EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f, i) => (
              <Link key={f.id} href={`/fields/${f.id}`} className="card card-hover block animate-fadeUp p-4" style={{ animationDelay: `${Math.min(i, 9) * 30}ms` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{f.name}</h2>
                    <p className="text-sm text-muted">{t(f.crop)} · {fmtNum(f.areaHa, 2)} ha · sown {fmtDate(f.sowingDate)}</p>
                  </div>
                  <RiskBadge p={f.summary?.stressProb ?? null} showPct={false} />
                </div>
                <p className="mt-3 text-lg font-semibold text-water">{decisionText(t, f.summary?.decision, f.summary?.seasonComplete)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Pill>{stageText(t, f.summary?.stage)}</Pill>
                  {f.mandi && <Pill>{f.mandi}</Pill>}
                  {f.ingesting && <Pill tone="water">updating</Pill>}
                </div>
              </Link>
            ))}
          </div>

          {fields.length >= 2 && (
            <Card className="mt-6">
              <CardTitle right={<IconCompare className="text-muted" />}>Compare two fields</CardTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                <select className="input" value={a} onChange={(e) => setA(e.target.value)} aria-label="First field">
                  <option value="">Choose a field…</option>
                  {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <select className="input" value={b} onChange={(e) => setB(e.target.value)} aria-label="Second field">
                  <option value="">Choose a field…</option>
                  {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              {fa && fb && (
                <div className="table-wrap mt-4 animate-fadeIn">
                  <table className="data-table">
                    <thead><tr><th /><th>{fa.name}</th><th>{fb.name}</th></tr></thead>
                    <tbody>
                      {[
                        ['Crop', t(fa.crop), t(fb.crop)],
                        ['Sowing date', fmtDate(fa.sowingDate), fmtDate(fb.sowingDate)],
                        ['Area', `${fmtNum(fa.areaHa, 2)} ha`, `${fmtNum(fb.areaHa, 2)} ha`],
                        ['Stage', stageText(t, fa.summary?.stage), stageText(t, fb.summary?.stage)],
                        ['Depletion', fmtMm(fa.summary?.depletion), fmtMm(fb.summary?.depletion)],
                        ['Stress point (RAW)', fmtMm(fa.summary?.raw), fmtMm(fb.summary?.raw)],
                        ['Decision', decisionText(t, fa.summary?.decision, fa.summary?.seasonComplete), decisionText(t, fb.summary?.decision, fb.summary?.seasonComplete)],
                      ].map(([k, x, y]) => <tr key={k}><td className="font-medium text-muted">{k}</td><td>{x}</td><td>{y}</td></tr>)}
                      <tr><td className="font-medium text-muted">Stress chance</td><td><RiskBadge p={fa.summary?.stressProb ?? null} /></td><td><RiskBadge p={fb.summary?.stressProb ?? null} /></td></tr>
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
