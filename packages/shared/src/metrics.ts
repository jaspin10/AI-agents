/**
 * X2 — derived metrics (docs/spec/x-series.md, X2). Pure functions over
 * snapshot history + X1's manual ad runs. No I/O, no platform knowledge:
 * a metric a platform can't report comes in as null and goes out as null.
 *
 * Every sub-decision here was locked 2026-09-10 (Jas) before code:
 *   - velocity with missing history → nearest earlier snapshot, flagged
 *   - multiple ad runs → ONE combined inside/outside split
 *   - the ad split is a TIME split, not paid/organic — the label travels
 *     with the data (see AD_SPLIT_LABEL) so no renderer can drop it.
 */

export interface Snapshot {
  /** UTC calendar date "YYYY-MM-DD". */
  capturedDate: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number | null;
  followersAtCapture: number | null;
}

export interface AdWindow {
  /** "YYYY-MM-DD" or null (unknown start → the run cannot be placed and is ignored). */
  startDate: string | null;
  /** "YYYY-MM-DD" or null (still running → treated as open through `today`). */
  endDate: string | null;
}

/** Rates as % of views from ONE snapshot. null where the input is unusable, never 0-by-default. */
export interface Rates {
  commentRatePct: number | null;
  shareRatePct: number | null;
  engagementRatePct: number | null;
}

export type VelocitySlot =
  | { status: 'exact'; views: number; day: number }
  /** No snapshot on day N — nearest one at or before it; `day` is the actual age used. */
  | { status: 'approx'; views: number; day: number }
  /** Video is younger than N days. */
  | { status: 'too_new' }
  /** Video is old enough but no snapshot exists at or before day N. */
  | { status: 'no_snapshot' };

export interface Velocity {
  day1: VelocitySlot;
  day7: VelocitySlot;
  day30: VelocitySlot;
}

export interface FollowerNormalised {
  /** latest views ÷ followers at the earliest snapshot on/after post date. */
  viewsPerFollower: number | null;
  /** Which snapshot supplied the follower count — shown so "at post time" is honest. */
  followersFromDate: string | null;
  followers: number | null;
}

/** The label is part of the data on purpose — render it, export it, log it. */
export const AD_SPLIT_LABEL =
  'Time split by ad-run dates — NOT a paid/organic split. Views gained during any ad window vs outside all windows.';

export interface AdSplit {
  label: typeof AD_SPLIT_LABEL;
  /** Views gained across snapshot intervals that overlap any ad run. */
  insideAdWindows: number;
  /** Views gained across intervals that touch no ad run. */
  outsideAdWindows: number;
  /** Views before the first snapshot can't be placed in time — reported, not hidden. */
  unattributedBeforeFirstSnapshot: number;
  runsUsed: number;
  runsIgnoredNoStart: number;
  /** null when there is no run to split against or fewer than 2 snapshots. */
  computable: boolean;
}

const DAY_MS = 86_400_000;

function toDate(d: string): number {
  return Date.parse(`${d}T00:00:00Z`);
}

function pct(num: number, views: number): number | null {
  return views > 0 ? Math.round((num / views) * 10000) / 100 : null;
}

export function sortSnapshots(snaps: readonly Snapshot[]): Snapshot[] {
  return [...snaps].sort((a, b) => a.capturedDate.localeCompare(b.capturedDate));
}

/** shareRate is null when shares are unreported (a platform that always sends 0 is handled by the caller via `sharesReported`). */
export function rates(s: Snapshot, opts: { sharesReported: boolean } = { sharesReported: true }): Rates {
  const shares = opts.sharesReported ? s.shares : null;
  const engagement = s.likes + s.comments + (shares ?? 0) + (s.saves ?? 0);
  return {
    commentRatePct: pct(s.comments, s.views),
    shareRatePct: shares === null ? null : pct(shares, s.views),
    engagementRatePct: pct(engagement, s.views),
  };
}

/** Age of a snapshot in whole days after posting (day 0 = same calendar day). */
export function ageDays(postedAt: string, capturedDate: string): number {
  const posted = Date.parse(postedAt);
  const postedDay = Math.floor(posted / DAY_MS) * DAY_MS;
  return Math.round((toDate(capturedDate) - postedDay) / DAY_MS);
}

function slot(sorted: readonly Snapshot[], postedAt: string, today: string, n: number): VelocitySlot {
  if (ageDays(postedAt, today) < n) return { status: 'too_new' };
  let best: Snapshot | null = null;
  let bestAge = -1;
  for (const s of sorted) {
    const age = ageDays(postedAt, s.capturedDate);
    if (age <= n && age > bestAge) {
      best = s;
      bestAge = age;
    }
  }
  if (best === null) return { status: 'no_snapshot' };
  return bestAge === n ? { status: 'exact', views: best.views, day: n } : { status: 'approx', views: best.views, day: bestAge };
}

export function velocity(snaps: readonly Snapshot[], postedAt: string, today: string): Velocity {
  const sorted = sortSnapshots(snaps);
  return {
    day1: slot(sorted, postedAt, today, 1),
    day7: slot(sorted, postedAt, today, 7),
    day30: slot(sorted, postedAt, today, 30),
  };
}

export function followerNormalised(snaps: readonly Snapshot[], postedAt: string): FollowerNormalised {
  const sorted = sortSnapshots(snaps);
  const latest = sorted[sorted.length - 1];
  const base = sorted.find((s) => ageDays(postedAt, s.capturedDate) >= 0 && s.followersAtCapture !== null && s.followersAtCapture > 0);
  if (latest === undefined || base === undefined || base.followersAtCapture === null) {
    return { viewsPerFollower: null, followersFromDate: null, followers: null };
  }
  return {
    viewsPerFollower: latest.views / base.followersAtCapture,
    followersFromDate: base.capturedDate,
    followers: base.followersAtCapture,
  };
}

/**
 * Combined split (locked): for each consecutive snapshot pair (a, b), the views
 * gained (b − a, floored at 0) go to `inside` if the interval (a, b] overlaps
 * any run's [start, end], else `outside`. Runs with no start date can't be
 * placed and are counted in runsIgnoredNoStart. A null end = open through today.
 */
export function adSplit(snaps: readonly Snapshot[], runs: readonly AdWindow[], today: string): AdSplit {
  const sorted = sortSnapshots(snaps);
  const windows = runs
    .filter((r): r is AdWindow & { startDate: string } => r.startDate !== null)
    .map((r) => ({ start: toDate(r.startDate), end: toDate(r.endDate ?? today) }));
  const base: AdSplit = {
    label: AD_SPLIT_LABEL,
    insideAdWindows: 0,
    outsideAdWindows: 0,
    unattributedBeforeFirstSnapshot: sorted[0]?.views ?? 0,
    runsUsed: windows.length,
    runsIgnoredNoStart: runs.length - windows.length,
    computable: windows.length > 0 && sorted.length >= 2,
  };
  if (!base.computable) return base;
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1] as Snapshot;
    const b = sorted[i] as Snapshot;
    const gained = Math.max(0, b.views - a.views);
    const from = toDate(a.capturedDate);
    const to = toDate(b.capturedDate);
    // interval (from, to] overlaps [start, end] when start <= to and end > from
    const inside = windows.some((w) => w.start <= to && w.end > from);
    if (inside) base.insideAdWindows += gained;
    else base.outsideAdWindows += gained;
  }
  return base;
}
