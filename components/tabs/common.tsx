'use client';

import { createContext, useContext } from 'react';
import { Banner, Card, EmptyState, Skeleton } from '../ui';
import { useApp } from '@/lib/i18n/context';
import type { ApiError } from '@/lib/client';

export interface FieldCtxValue {
  id: string;
  owned: boolean;
  crop: 'Wheat' | 'Soybean';
  name: string;
  ingestStatus: string;
  ingesting: boolean;
  version: number;
  refreshData: () => void;
  onFieldChanged: () => void;
}

export const FieldCtx = createContext<FieldCtxValue | null>(null);
export const useField = () => {
  const c = useContext(FieldCtx);
  if (!c) throw new Error('useField outside FieldCtx');
  return c;
};

export function TabSkeleton({ shape = 'default' }: { shape?: 'default' | 'chart' | 'table' }) {
  return (
    <div className="space-y-4" aria-busy="true">
      {shape !== 'table' && <Card><Skeleton className="mb-3 h-5 w-40" /><Skeleton className={shape === 'chart' ? 'h-64 w-full' : 'h-16 w-2/3'} /></Card>}
      <Card><Skeleton className="mb-3 h-5 w-32" />{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="mb-2 h-9 w-full" />)}</Card>
    </div>
  );
}

/** Uniform loading / error / empty states for every tab. */
export function TabState({ loading, error, empty, hasData, shape, children }: {
  loading: boolean; error: ApiError | null; empty: boolean; hasData: boolean; shape?: 'default' | 'chart' | 'table'; children: React.ReactNode;
}) {
  const { t } = useApp();
  const f = useField();
  if (loading && !hasData) return <TabSkeleton shape={shape} />;
  if (error && !hasData) return <Banner tone="danger">Could not load this tab: {error.message}</Banner>;
  if (empty) return <EmptyState message={t('noData', { status: f.ingestStatus })} onRefresh={f.refreshData} busy={f.ingesting} />;
  return (
    <div className="animate-fadeUp space-y-4">
      {error && <Banner tone="warning">Refresh failed: {error.message}. {t('savedResults')}.</Banner>}
      {children}
    </div>
  );
}
