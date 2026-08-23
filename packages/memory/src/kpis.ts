import type { MemoryClient } from './client.js';

/** 'YYYY-MM' UTC key from an ISO timestamp. */
function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export interface MonthlyKpis {
  month: string; // 'YYYY-MM'
  /** KPI 1: completed enrollments in the month (Stripe checkout sessions, status 'complete'/'paid'). */
  enrollments: number;
  /** Gross revenue for those enrollments, in cents (null amounts count as 0). */
  revenueCents: number;
  /** KPI 3 numerator: hypothesis-tagged videos POSTED in the month. */
  taggedVideos: number;
  /** Total videos posted in the month (context for the tagged count). */
  videosPosted: number;
  /** Suggestions by status created in the month — the feedback loop's pulse. */
  suggestions: { surfaced: number; rejected: number; posted: number; skipped: number };
}

const COMPLETED_STATUSES = new Set(['complete', 'completed', 'paid']);

/**
 * Monthly KPI breakdowns computed from the memory tables. Reads everything and
 * groups in TS — fine at current volumes (hundreds of rows); move to SQL views
 * if tables grow past tens of thousands.
 * KPI 2 (demo requests/week) intentionally absent: no data source exists yet.
 */
export async function monthlyKpis(
  memory: MemoryClient,
  monthsBack = 6
): Promise<MonthlyKpis[]> {
  const [enrollments, content, suggestions] = await Promise.all([
    memory.enrollments.all(),
    memory.content.all(),
    memory.suggestions.all(),
  ]);

  const byMonth = new Map<string, MonthlyKpis>();
  const ensure = (month: string): MonthlyKpis => {
    let row = byMonth.get(month);
    if (row === undefined) {
      row = {
        month,
        enrollments: 0,
        revenueCents: 0,
        taggedVideos: 0,
        videosPosted: 0,
        suggestions: { surfaced: 0, rejected: 0, posted: 0, skipped: 0 },
      };
      byMonth.set(month, row);
    }
    return row;
  };

  for (const e of enrollments) {
    if (!COMPLETED_STATUSES.has(e.status.toLowerCase())) continue;
    const row = ensure(monthOf(e.enrolledAt));
    row.enrollments += 1;
    row.revenueCents += e.amountCents ?? 0;
  }

  for (const c of content) {
    const row = ensure(monthOf(c.postedAt));
    row.videosPosted += 1;
    if (c.hypothesis !== null) row.taggedVideos += 1;
  }

  for (const s of suggestions) {
    const row = ensure(monthOf(s.createdAt));
    if (s.status === 'surfaced') row.suggestions.surfaced += 1;
    else if (s.status === 'rejected') row.suggestions.rejected += 1;
    else if (s.status === 'posted') row.suggestions.posted += 1;
    else if (s.status === 'skipped') row.suggestions.skipped += 1;
  }

  // Most recent first, limited to monthsBack.
  return [...byMonth.values()]
    .sort((a, b) => (a.month < b.month ? 1 : -1))
    .slice(0, monthsBack);
}