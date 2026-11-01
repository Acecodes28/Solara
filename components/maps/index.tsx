'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '../ui';

const loading = () => <Skeleton className="h-[340px] w-full rounded-card" />;

export const FieldsMap = dynamic(() => import('./LeafletMaps').then((m) => m.FieldsMap), { ssr: false, loading });
export const DrawMap = dynamic(() => import('./LeafletMaps').then((m) => m.DrawMap), { ssr: false, loading });
export type { MapField, DrawMode } from './LeafletMaps';
