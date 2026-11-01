import { step, type BalanceParams } from './balance';

export interface MemberSeries {
  precip: (number | null)[];
  et0: (number | null)[];
}

export interface SevenDayResult {
  probByDay: (number | null)[]; // index 0 = day 1
  members: number;
  excluded: number;
}

/**
 * L7. Runs the balance forward from today's depletion for each ensemble member.
 * kc[k-1] is the crop coefficient on day k. A member with any missing value in days 1..7 is excluded.
 */
export function sevenDayOutlook(startDepletion: number, kc: number[], members: MemberSeries[], params: BalanceParams): SevenDayResult {
  const valid = members.filter((m) => {
    for (let k = 0; k < 7; k++) if (m.precip[k] == null || m.et0[k] == null) return false;
    return true;
  });
  const excluded = members.length - valid.length;
  if (valid.length === 0) return { probByDay: Array(7).fill(null), members: 0, excluded };
  const reachedBy = Array(7).fill(0);
  for (const m of valid) {
    let dep = startDepletion;
    let reached = false;
    for (let k = 0; k < 7; k++) {
      dep = step(dep, { date: '', precip: m.precip[k], et0: m.et0[k], kc: kc[k] }, params).depletion;
      if (dep >= params.raw) reached = true;
      if (reached) reachedBy[k]++;
    }
  }
  return { probByDay: reachedBy.map((c) => c / valid.length), members: valid.length, excluded };
}

export interface WeeklyRow {
  week: number; // 2..6
  normalMm: number | null;
  prob: number | null;
  members: number;
}

/**
 * L8. memberWeekTotals[m][w] = weekly precipitation of member m for week w (w = 2..6 mapped to 0..4).
 */
export function weeklyBelowHalfNormal(memberWeekTotals: (number | null)[][], normals: (number | null)[]): WeeklyRow[] {
  return normals.map((normal, i) => {
    const totals = memberWeekTotals.map((m) => m[i]).filter((v): v is number => v != null);
    if (normal == null || totals.length === 0) return { week: i + 2, normalMm: normal, prob: null, members: totals.length };
    const below = totals.filter((t) => t < 0.5 * normal).length;
    return { week: i + 2, normalMm: normal, prob: below / totals.length, members: totals.length };
  });
}
