import type { Decision } from '../engine/decision';
import type { Alert } from '../engine/alerts';
import type { Stage } from '../config/crops';

export interface SourceStamp { source: string; fetchedAt: string | null }

export interface SimilarSeason {
  year: number;
  depletionRatio: number;
  stressDays: number;
  weight: number;
  stressFlag: 0 | 1;
  criticalStressDays: number;
  looProb: number | null;
}

export interface FieldSummary {
  asOf: string;
  computedAt: string;
  dayOfSeason: number;
  seasonLength: number;
  seasonComplete: boolean;
  stage: Stage | null;
  gdd: number | null;
  soil: { sandPct: number; clayPct: number; socPct: number; omPct: number; awc: number; source: string; fetchedAt: string } | null;
  taw: number | null;
  raw: number | null;
  today: { date: string; depletion: number; ks: number } | null;
  gapCount: number;
  weather: SourceStamp;
  decision: Decision | null;
  outlook7: { probByDay: (number | null)[]; members: number; excluded: number; asOf: string } & SourceStamp | null;
  outlook6: { rows: { week: number; normalMm: number | null; prob: number | null; members: number }[]; asOf: string } & SourceStamp | null;
  alerts: Alert[];
  alertsSource: SourceStamp;
  risk: {
    status: 'ok' | 'insufficient' | 'no_data';
    prob: number | null;
    n: number;
    current: { depletionRatio: number; stressDays: number } | null;
    similar: SimilarSeason[];
    validation: { brier: number; baseline: number; skill: number | null; n: number } | null;
  };
  errors: { source: string; message: string; lastSuccessAt: string | null }[];
}

export interface AdviceItem {
  type: 'irrigate_now' | 'irrigate_soon' | 'no_irrigation' | 'frost' | 'heavy_rain' | 'heatwave' | 'sell' | 'hold' | 'monitor';
  title: { en: string; hi: string };
  text: { en: string; hi: string };
  factIds: string[];
}
