'use client';

import { cx } from './ui';
import { IconCheck, IconX } from './icons';

export interface Job { kind: 'history' | 'soil' | 'ndvi' | 'prices'; status: 'queued' | 'running' | 'done' | 'failed'; message: string | null }

const LABEL: Record<Job['kind'], string> = { history: 'Weather (20 years + forecast)', soil: 'Soil profile', ndvi: 'Satellite', prices: 'Mandi prices' };

export function IngestProgress({ jobs }: { jobs: Job[] }) {
  const kinds: Job['kind'][] = ['history', 'soil', 'ndvi', 'prices'];
  return (
    <ul className="space-y-2" aria-live="polite">
      {kinds.map((k) => {
        const j = jobs.find((x) => x.kind === k);
        const status = j?.status ?? 'queued';
        return (
          <li key={k} className="flex items-start gap-3 rounded-ctl border border-line bg-white px-3 py-2.5">
            <span className={cx('mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors duration-200',
              status === 'done' && 'bg-success text-white', status === 'failed' && 'bg-danger-soft text-danger', (status === 'running' || status === 'queued') && 'bg-water-soft text-water')}>
              {status === 'done' ? <IconCheck size={14} /> : status === 'failed' ? <IconX size={14} /> : <span className="h-3 w-3 animate-spin rounded-full border-2 border-water border-t-transparent" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{LABEL[k]} <span className="font-normal text-muted">· {status === 'queued' || status === 'running' ? 'loading' : status}</span></p>
              {j?.message && <p className={cx('text-xs', status === 'failed' ? 'text-danger' : 'text-muted')}>{j.message}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
