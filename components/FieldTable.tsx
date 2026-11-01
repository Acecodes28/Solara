'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/i18n/context';
import type { FieldListItem } from '@/lib/hooks';
import { decisionText, stageText, ALERT_LABEL } from './fieldText';
import { Pill, RiskBadge, cx } from './ui';
import { IconDrop } from './icons';

export function FieldTable({ fields }: { fields: FieldListItem[] }) {
  const { t } = useApp();
  const router = useRouter();
  return (
    <div className="table-wrap">
      <table className="data-table stack-table">
        <thead>
          <tr>
            <th>{t('col_field')}</th>
            <th>{t('col_crop')}</th>
            <th>{t('col_stage')}</th>
            <th>{t('col_decision')}</th>
            <th>{t('col_stress')}</th>
            <th>{t('col_alerts')}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f, i) => {
            const s = f.summary;
            const urgent = s?.decision?.kind === 'irrigate_now';
            return (
              <tr key={f.id} className="animate-fadeUp cursor-pointer" style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }} onClick={() => router.push(`/fields/${f.id}`)}>
                <td data-label={t('col_field')}>
                  <Link href={`/fields/${f.id}`} className="font-semibold text-ink hover:text-primary" onClick={(e) => e.stopPropagation()}>{f.name}</Link>
                  {f.ingesting && <span className="ml-2"><Pill tone="water">updating</Pill></span>}
                </td>
                <td data-label={t('col_crop')}>{t(f.crop)}</td>
                <td data-label={t('col_stage')}>{s?.seasonComplete ? t('season_complete') : stageText(t, s?.stage)}</td>
                <td data-label={t('col_decision')}>
                  <span className={cx('inline-flex items-center gap-1.5 font-medium', urgent ? 'text-water' : 'text-ink')}>
                    {urgent && <IconDrop size={16} />}
                    {decisionText(t, s?.decision, s?.seasonComplete)}
                  </span>
                </td>
                <td data-label={t('col_stress')}>
                  {s?.riskStatus === 'insufficient' ? <span className="text-xs text-muted">{s.seasonsUsed} of 10 seasons</span> : <RiskBadge p={s?.stressProb ?? null} />}
                </td>
                <td data-label={t('col_alerts')}>
                  {s?.alertsToday.length ? (
                    <span className="flex flex-wrap justify-end gap-1 xs:justify-start">{s.alertsToday.map((a) => <Pill key={a} tone="danger">{ALERT_LABEL[a] ?? a}</Pill>)}</span>
                  ) : <span className="text-muted">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
