'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { useApp } from '@/lib/i18n/context';
import type { StringKey } from '@/lib/i18n/strings';
import { api } from '@/lib/client';
import { cx } from './ui';
import {
  IconBell, IconBook, IconChat, IconDashboard, IconField, IconHome, IconInfo, IconMarket, IconPulse, IconRefresh, SolaraMark,
} from './icons';

const NAV: { href: string; key: StringKey; icon: (p: { size?: number }) => JSX.Element; mobile?: boolean }[] = [
  { href: '/', key: 'nav_home', icon: IconHome },
  { href: '/dashboard', key: 'nav_dashboard', icon: IconDashboard, mobile: true },
  { href: '/fields', key: 'nav_fields', icon: IconField, mobile: true },
  { href: '/market', key: 'nav_market', icon: IconMarket, mobile: true },
  { href: '/advisor', key: 'nav_advisor', icon: IconChat, mobile: true },
  { href: '/alerts', key: 'nav_alerts', icon: IconBell, mobile: true },
  { href: '/health', key: 'nav_health', icon: IconPulse },
  { href: '/methodology', key: 'nav_methodology', icon: IconBook },
  { href: '/about', key: 'nav_about', icon: IconInfo },
];

type HealthState = 'ok' | 'stale' | 'failed' | 'unknown';
const HealthCtx = createContext<{ state: HealthState; reload: () => void }>({ state: 'unknown', reload: () => undefined });
export const useHealth = () => useContext(HealthCtx);

function overall(sources: { state: string }[]): HealthState {
  if (sources.some((s) => s.state === 'failed')) return 'failed';
  if (sources.some((s) => s.state === 'stale')) return 'stale';
  return 'ok';
}

export function StatusDot({ compact }: { compact?: boolean }) {
  const { state } = useHealth();
  const color = { ok: 'bg-success', stale: 'bg-warning', failed: 'bg-danger', unknown: 'bg-line' }[state];
  const label = { ok: 'All sources ok', stale: 'Some data is stale', failed: 'A source failed', unknown: 'Checking sources' }[state];
  return (
    <Link href="/health" className="inline-flex min-h-[44px] items-center gap-2 rounded-ctl px-2 text-xs font-medium text-muted hover:bg-page" title={label} aria-label={`Data health: ${label}`}>
      <span className="relative flex h-2.5 w-2.5">
        {state === 'failed' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />}
        <span className={cx('relative inline-flex h-2.5 w-2.5 rounded-full', color)} />
      </span>
      {!compact && <span className="hidden xl:inline">{label}</span>}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useApp();
  const [health, setHealth] = useState<HealthState>('unknown');
  const reload = () => {
    api<{ sources: { state: string }[] }>('/api/health').then((h) => setHealth(overall(h.sources))).catch(() => setHealth('failed'));
  };
  useEffect(() => {
    reload();
    const id = setInterval(reload, 120_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { reload(); }, [pathname]);

  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <HealthCtx.Provider value={{ state: health, reload }}>
      <div className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-ctl focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
        <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-line bg-white sm:flex lg:w-[240px]">
          <Link href="/" className="flex h-16 items-center gap-3 px-[18px] lg:px-5">
            <SolaraMark />
            <span className="hidden flex-col leading-tight lg:flex">
              <span className="text-[17px] font-bold tracking-tight text-primary">{t('appName')}</span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{t('tagline')}</span>
            </span>
          </Link>
          <nav className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Main">
            {NAV.map(({ href, key, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                title={t(key)}
                aria-current={active(href) ? 'page' : undefined}
                className={cx('nav-link group', active(href) ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-page hover:text-ink')}
              >
                <span className={cx('absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-opacity duration-150', active(href) ? 'opacity-100' : 'opacity-0')} />
                <Icon size={20} />
                <span className="hidden lg:inline">{t(key)}</span>
              </Link>
            ))}
          </nav>
          <div className="border-t border-line p-3">
            <StatusDot />
          </div>
        </aside>

        <div className="sm:pl-[72px] lg:pl-[240px]">
          <main id="main" className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-4 sm:px-6 sm:pb-12 lg:px-8">{children}</main>
        </div>

        <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white/95 backdrop-blur sm:hidden" aria-label="Main">
          {NAV.filter((n) => n.mobile).map(({ href, key, icon: Icon }) => (
            <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined} className={cx('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-150', active(href) ? 'text-primary' : 'text-muted')}>
              <Icon size={20} />
              <span className="max-w-full truncate px-1">{t(key)}</span>
            </Link>
          ))}
        </nav>
      </div>
    </HealthCtx.Provider>
  );
}

/** Header on every page: title, one subtitle line, status dot, language switch, refresh. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  const { t, lang, setLang, refresh } = useApp();
  const { reload } = useHealth();
  const [spin, setSpin] = useState(false);
  return (
    <header className="no-print mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4 pt-2">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" className="sm:hidden"><SolaraMark size={32} /></Link>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {actions}
        <StatusDot compact />
        <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="btn-icon font-deva text-sm font-semibold" aria-label="Switch language">
          {t('language')}
        </button>
        <button
          onClick={() => { setSpin(true); refresh(); reload(); setTimeout(() => setSpin(false), 600); }}
          className="btn-icon"
          aria-label={t('refresh')}
          title={t('refresh')}
        >
          <IconRefresh size={20} className={spin ? 'animate-spin' : ''} />
        </button>
      </div>
    </header>
  );
}
