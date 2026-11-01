'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader, StatusDot } from '@/components/AppShell';
import { Banner, ButtonLink, Card, Pill, Skeleton, cx } from '@/components/ui';
import { IconChat, IconPrint, IconRefresh, IconTrash } from '@/components/icons';
import { IngestProgress, type Job } from '@/components/IngestProgress';
import { FieldCtx, type FieldCtxValue } from '@/components/tabs/common';
import { TodayTab } from '@/components/tabs/TodayTab';
import { WaterTab } from '@/components/tabs/WaterTab';
import { RiskTab } from '@/components/tabs/RiskTab';
import { SatelliteTab } from '@/components/tabs/SatelliteTab';
import { MarketTab } from '@/components/tabs/MarketTab';
import { HarvestTab } from '@/components/tabs/HarvestTab';
import { BacktestTab } from '@/components/tabs/BacktestTab';
import { stageText } from '@/components/fieldText';
import { api, ApiError } from '@/lib/client';
import { useApp } from '@/lib/i18n/context';
import type { StringKey } from '@/lib/i18n/strings';
import { fmtDate, fmtNum } from '@/lib/format';

const TABS = ['today', 'water', 'risk', 'satellite', 'market', 'harvest', 'backtest'] as const;
type Tab = (typeof TABS)[number];

interface FieldResp {
  field: { id: string; name: string; crop: 'Wheat' | 'Soybean'; areaHa: number; sowingDate: string; mandi: string | null; centroid: { lat: number; lon: number } };
  owned: boolean;
  ingestion: Job[];
  header: { stage: string | null; dayOfSeason: number; seasonLength: number; seasonComplete: boolean; gdd: number | null; computedAt: string } | null;
}

export function FieldView({ params }: { params: { id: string } }) {
  const { t, refreshTick } = useApp();
  const router = useRouter();
  const [data, setData] = useState<FieldResp | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [version, setVersion] = useState(0);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const wasIngesting = useRef(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (q && TABS.includes(q)) setTab(q);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api<FieldResp>(`/api/fields/${params.id}`);
      setData(r);
      setLoadErr(null);
      const ingesting = r.ingestion.some((j) => j.status === 'queued' || j.status === 'running');
      if (wasIngesting.current && !ingesting) setVersion((v) => v + 1);
      wasIngesting.current = ingesting;
      return ingesting;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setLoadErr(e instanceof ApiError ? e.message : 'Could not load field.');
      return false;
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load, refreshTick]);

  const ingesting = !!data?.ingestion.some((j) => j.status === 'queued' || j.status === 'running');
  useEffect(() => {
    if (!ingesting) return;
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [ingesting, load]);

  // Tabs switch without a page reload: state plus a replaced URL.
  const selectTab = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url.toString());
  };

  const refreshData = async () => {
    setRefreshMsg(null);
    try {
      await api(`/api/fields/${params.id}/ingest`, { method: 'POST' });
      wasIngesting.current = true;
      await load();
    } catch (e) {
      setRefreshMsg(e instanceof ApiError && e.status === 409 ? 'Already updating' : e instanceof ApiError ? e.message : 'Refresh failed.');
    }
  };

  const remove = async () => {
    if (!data || !window.confirm(`Delete “${data.field.name}” and its alert links? This cannot be undone.`)) return;
    try {
      await api(`/api/fields/${params.id}`, { method: 'DELETE' });
      router.push('/dashboard');
    } catch (e) { setRefreshMsg(e instanceof ApiError ? e.message : 'Delete failed.'); }
  };

  if (notFound) {
    return (
      <div className="animate-fadeUp">
        <PageHeader title={t('notFoundField')} />
        <Card className="text-center"><p className="mb-4 text-muted">The link may be old, or the field was deleted.</p><ButtonLink href="/dashboard">{t('backToDashboard')}</ButtonLink></Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <div className="mb-5 border-b border-line pb-4 pt-2"><Skeleton className="h-8 w-64" /><Skeleton className="mt-2 h-4 w-80" /></div>
        {loadErr ? <Banner tone="danger">{loadErr}</Banner> : <><Skeleton className="mb-4 h-11 w-full" /><Skeleton className="h-64 w-full rounded-card" /></>}
      </div>
    );
  }

  const f = data.field;
  const h = data.header;
  const ingestStatus = ingesting ? 'running' : data.ingestion.length ? (data.ingestion.every((j) => j.status === 'done') ? 'done' : 'done with some failures') : 'not started';
  const ctx: FieldCtxValue = {
    id: f.id, owned: data.owned, crop: f.crop, name: f.name, ingestStatus, ingesting, version,
    refreshData, onFieldChanged: () => { load(); },
  };

  return (
    <FieldCtx.Provider value={ctx}>
      <div className="animate-fadeUp">
        <PageHeader
          title={f.name}
          subtitle={`${t(f.crop)} · ${fmtNum(f.areaHa, 2)} ha · ${h?.seasonComplete ? t('season_complete') : stageText(t, h?.stage)}${h ? ` (day ${h.dayOfSeason})` : ''} · sown ${fmtDate(f.sowingDate)}`}
          actions={
            <div className="no-print flex items-center gap-1">
              <button className="btn-icon" onClick={refreshData} disabled={ingesting} title="Refresh this field's data" aria-label="Refresh this field's data"><IconRefresh size={20} className={ingesting ? 'animate-spin' : ''} /></button>
              <button className="btn-icon" onClick={() => window.print()} title="Download report (PDF)" aria-label="Download report as PDF"><IconPrint size={20} /></button>
              {data.owned && <button className="btn-icon hover:!text-danger" onClick={remove} title="Delete field" aria-label="Delete field"><IconTrash size={20} /></button>}
            </div>
          }
        />
        <div className="mb-3 hidden print:block">
          <p className="text-sm">Solara Field Advisor report · {f.name} · centre {f.centroid.lat.toFixed(4)}, {f.centroid.lon.toFixed(4)} · printed {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
        </div>

        {refreshMsg && <div className="mb-3"><Banner tone="warning">{refreshMsg}</Banner></div>}
        {ingesting && (
          <Card className="mb-4 animate-fadeIn">
            <p className="mb-3 text-sm font-semibold">Updating data for this field…</p>
            <IngestProgress jobs={data.ingestion} />
          </Card>
        )}
        {!ingesting && data.ingestion.some((j) => j.status === 'failed') && (
          <div className="mb-4 flex flex-wrap gap-1.5 text-xs">
            {data.ingestion.filter((j) => j.status === 'failed').map((j) => <Pill key={j.kind} tone="warning">{j.kind}: {j.message}</Pill>)}
          </div>
        )}

        <div className="no-print -mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div role="tablist" aria-label="Field sections" className="inline-flex min-w-full gap-1 rounded-card bg-[#EAEFE6] p-1 sm:min-w-0">
            {TABS.map((k) => (
              <button key={k} role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} onClick={() => selectTab(k)} className="tab" data-testid={`tab-${k}`}>
                {t(`tab_${k}` as StringKey)}
              </button>
            ))}
          </div>
        </div>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} key={tab} className={cx('min-h-[300px]')}>
          {tab === 'today' && <TodayTab />}
          {tab === 'water' && <WaterTab />}
          {tab === 'risk' && <RiskTab />}
          {tab === 'satellite' && <SatelliteTab />}
          {tab === 'market' && <MarketTab />}
          {tab === 'harvest' && <HarvestTab />}
          {tab === 'backtest' && <BacktestTab />}
        </div>

        <div className="no-print mt-6 flex items-center justify-between gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">Data health <StatusDot compact /></span>
          <Link href={`/advisor?field=${f.id}`} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"><IconChat size={16} /> {t('ask')}</Link>
        </div>
      </div>
      <Link href={`/advisor?field=${f.id}`} className="no-print fixed bottom-20 right-4 z-20 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform duration-150 hover:scale-105 sm:bottom-6" aria-label={t('ask')}>
        <IconChat size={24} />
      </Link>
    </FieldCtx.Provider>
  );
}
