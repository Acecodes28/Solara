'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { ButtonLink, Card, Skeleton, Stat } from '@/components/ui';
import { IconChat, IconDrop, IconMarket, IconPlus, IconRain, IconSatellite } from '@/components/icons';
import { useApi, type FieldListItem } from '@/lib/hooks';
import { useApp } from '@/lib/i18n/context';
import { fmtDateTime } from '@/lib/format';

export default function HomePage() {
  const { t } = useApp();
  const { data, loading } = useApi<{ fields: FieldListItem[] }>('/api/fields');
  const fields = data?.fields ?? [];
  const high = fields.filter((f) => (f.summary?.stressProb ?? 0) >= 0.5).length;
  const last = fields.map((f) => f.summary?.computedAt).filter(Boolean).sort().at(-1) ?? null;

  const features = [
    { icon: IconDrop, title: 'Irrigation in millimetres', text: 'A daily FAO-56 root-zone water balance for your field, from sowing to today.' },
    { icon: IconRain, title: 'Season stress and weather warnings', text: '20 years of ERA5 history, a 51-member ensemble and frost, rain and heat alerts.' },
    { icon: IconSatellite, title: 'Satellite check', text: 'Sentinel-2 vegetation index against past seasons on the same dates.' },
    { icon: IconMarket, title: 'Sell or hold', text: 'This month’s mandi price against past years, with the expected gain of holding.' },
  ];

  return (
    <div className="animate-fadeUp">
      <PageHeader title={t('appName') + ' ' + t('tagline')} subtitle={t('decisionAid')} />
      <section className="relative overflow-hidden rounded-card border border-line bg-gradient-to-br from-primary to-[#2A6339] px-5 py-8 text-white sm:px-8 sm:py-12">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#F3C969]/20 blur-2xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-1/2 opacity-20 sm:block" style={{ background: 'repeating-linear-gradient(170deg, transparent 0 18px, rgba(255,255,255,.5) 18px 20px)' }} />
        <div className="relative max-w-2xl">
          <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-4xl">{t('home_title')}</h2>
          <p className="mt-3 text-[15px] text-white/85 sm:text-base">{t('home_sub')}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/fields/new" className="bg-white !text-primary hover:bg-[#F3F7F1]"><IconPlus size={18} /> {t('addField')}</ButtonLink>
            <Link href="/advisor" className="btn border border-white/40 text-white hover:bg-white/10"><IconChat size={18} /> {t('ask')}</Link>
          </div>
        </div>
      </section>

      <Card className="mt-4 grid grid-cols-3 gap-4">
        {loading ? (
          <>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</>
        ) : (
          <>
            <Stat label={t('fieldCount')} value={fields.length} />
            <Stat label={t('highRisk')} value={<span className={high ? 'text-danger' : ''}>{high}</span>} />
            <Stat label={t('lastRefresh')} value={<span className="text-base">{last ? fmtDateTime(last) : '—'}</span>} />
          </>
        )}
      </Card>

      <Card className="mt-4">
        <p className="text-[15px] leading-relaxed text-ink">{t('home_problem')}</p>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: Icon, title, text }, i) => (
          <Card key={title} className="card-hover animate-fadeUp" style={{ animationDelay: `${i * 40}ms` }}>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-ctl bg-primary-soft text-primary"><Icon /></span>
            <h3 className="mt-3 font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-muted">Weather data by Open-Meteo.com · ERA5: Copernicus Climate Change Service · Soil: SoilGrids v2.0 (ISRIC)</p>
    </div>
  );
}
