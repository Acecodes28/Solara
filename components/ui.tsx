'use client';

import Link from 'next/link';
import { ageLabel, fmtDateTime, fmtPct } from '@/lib/format';
import { useApp } from '@/lib/i18n/context';
import { IconAlert, IconInfo, IconRefresh } from './icons';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Card({ children, className, as: As = 'section', ...rest }: { children: React.ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return <As className={cx('card p-4 sm:p-5', className)} {...rest}>{children}</As>;
}

export function CardTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
      {right}
    </div>
  );
}

export function Button({ variant = 'primary', className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return (
    <button
      className={cx(
        'btn',
        variant === 'primary' && 'bg-primary text-white hover:bg-primary-dark',
        variant === 'secondary' && 'border border-line bg-white text-ink hover:bg-page',
        variant === 'ghost' && 'text-primary hover:bg-primary-soft',
        variant === 'danger' && 'border border-danger/30 bg-white text-danger hover:bg-danger-soft',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ButtonLink({ href, children, variant = 'primary', className }: { href: string; children: React.ReactNode; variant?: 'primary' | 'secondary'; className?: string }) {
  return (
    <Link href={href} className={cx('btn', variant === 'primary' ? 'bg-primary text-white hover:bg-primary-dark' : 'border border-line bg-white text-ink hover:bg-page', className)}>
      {children}
    </Link>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-ctl', className)} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-11 w-full" />)}
    </div>
  );
}

export function Banner({ tone, children, action }: { tone: 'danger' | 'warning' | 'info' | 'success'; children: React.ReactNode; action?: React.ReactNode }) {
  const styles = {
    danger: 'border-danger/30 bg-danger-soft text-danger',
    warning: 'border-warning/50 bg-warning-soft text-warning-text',
    info: 'border-water/30 bg-water-soft text-water',
    success: 'border-success/30 bg-success-soft text-success',
  }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex animate-fadeIn items-start gap-2 rounded-ctl border px-3 py-2.5 text-sm', styles)}>
      {tone === 'info' || tone === 'success' ? <IconInfo className="mt-0.5 shrink-0" size={18} /> : <IconAlert className="mt-0.5 shrink-0" size={18} />}
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}

export function riskLevel(p: number | null | undefined): 'low' | 'medium' | 'high' | 'none' {
  if (p == null) return 'none';
  if (p >= 0.5) return 'high';
  if (p >= 0.25) return 'medium';
  return 'low';
}

export const RISK_COLOR = { low: '#2E7D32', medium: '#D9A441', high: '#B71C1C', none: '#9AA59C' } as const;

/** Risk uses text as well as colour. */
export function RiskBadge({ p, showPct = true }: { p: number | null | undefined; showPct?: boolean }) {
  const { t } = useApp();
  const lvl = riskLevel(p);
  const cls = { low: 'bg-success-soft text-success', medium: 'bg-warning-soft text-warning-text', high: 'bg-danger-soft text-danger', none: 'bg-page text-muted' }[lvl];
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', cls)}>
      <span className="h-2 w-2 rounded-full" style={{ background: RISK_COLOR[lvl] }} />
      {t(`risk_${lvl}`)}{showPct && p != null ? ` · ${fmtPct(p)}` : ''}
    </span>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'water' | 'warning' | 'danger' | 'success' }) {
  const cls = { neutral: 'bg-page text-muted border-line', water: 'bg-water-soft text-water border-water/20', warning: 'bg-warning-soft text-warning-text border-warning/30', danger: 'bg-danger-soft text-danger border-danger/20', success: 'bg-success-soft text-success border-success/20' }[tone];
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', cls)}>{children}</span>;
}

/** Source and fetch time shown beside every number. Stale facts get a badge with their age. */
export function SourceLine({ source, fetchedAt, staleHours, className }: { source: string; fetchedAt: string | null | undefined; staleHours?: number; className?: string }) {
  const { t } = useApp();
  const stale = fetchedAt && staleHours != null && (Date.now() - new Date(fetchedAt).getTime()) / 3_600_000 > staleHours;
  return (
    <p className={cx('mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted', className)}>
      <span>{t('source')}: {source}</span>
      {fetchedAt && <span>· {t('fetched')} {fmtDateTime(fetchedAt)}</span>}
      {stale && <Pill tone="warning">{t('stale')} · {ageLabel(fetchedAt)}</Pill>}
    </p>
  );
}

export function EmptyState({ message, onRefresh, busy, children }: { message: string; onRefresh?: () => void; busy?: boolean; children?: React.ReactNode }) {
  const { t } = useApp();
  return (
    <div className="flex animate-fadeIn flex-col items-center gap-3 rounded-card border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      <p className="max-w-md text-sm text-muted">{message}</p>
      {children}
      {onRefresh && (
        <Button variant="secondary" onClick={onRefresh} disabled={busy}>
          <IconRefresh size={18} className={busy ? 'animate-spin' : ''} /> {busy ? 'Already updating' : t('refresh')}
        </Button>
      )}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 truncate text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function ErrorsBanner({ errors }: { errors: { source: string; message: string; lastSuccessAt: string | null }[] }) {
  if (!errors.length) return null;
  return (
    <Banner tone="warning">
      {errors.map((e) => (
        <p key={e.source}>
          <strong>{e.source}</strong> update failed{e.lastSuccessAt ? `; last success ${fmtDateTime(e.lastSuccessAt)}` : ''}. Showing saved results.
        </p>
      ))}
    </Banner>
  );
}
