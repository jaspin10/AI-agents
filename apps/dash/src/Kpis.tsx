import { useEffect, useState } from 'react';
import {
  getCoverage,
  getMonthlyKpis,
  getPortalCounts,
  type CoveragePayload,
  type MonthlyKpis,
  type PortalCountsPayload,
  type PortalMonth,
} from './api.js';

/**
 * X3 — KPI view, rebuilt (docs/spec/x-series.md, X3). Owner only (App.tsx).
 *
 * Three cards, top to bottom:
 *   1. What Stripe can see, month by month — the heading itself says it is
 *      incomplete. The word "total" does not appear on this panel: e-transfer
 *      and manual invoices never touch Checkout, so this number is a floor.
 *   2. What the portal actually has (dash-counts handover, from Sept 2026):
 *      per month → per level → new / renewed / how they paid. The gap column
 *      is Stripe vs portal for the same month — this is the B2 finder.
 *   3. KPI 3: videos analysed per posted week against the 4/week goal, from
 *      content_analysis rows (not the old CSV, not content.hypothesis).
 *
 * The old revenue table was erased 2026-09-10; nothing here restores it.
 * Revenue shows only as "revenue we can see (Stripe)" beside its month.
 */

const PORTAL_FROM = '2026-09';
const MONTHS_SHOWN = 12;

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' });
}

function levelLabel(level: string): string {
  return level === 'unset' ? 'no level' : `L${level}`;
}

function sourceLabel(source: string): string {
  if (source === 'stripe') return 'card (Stripe)';
  if (source === 'interac') return 'e-transfer';
  if (source === 'unknown') return 'not recorded';
  return source;
}

interface MonthRow {
  month: string;
  stripe: MonthlyKpis | null;
  portal: PortalMonth | null;
}

/** Same month on both sides, newest first. Portal months earlier than PORTAL_FROM never exist by design. */
function joinMonths(stripe: MonthlyKpis[], portal: PortalMonth[] | null): MonthRow[] {
  const keys = new Set<string>();
  for (const s of stripe) keys.add(s.month);
  for (const p of portal ?? []) keys.add(p.month);
  const stripeBy = new Map(stripe.map((s) => [s.month, s] as const));
  const portalBy = new Map((portal ?? []).map((p) => [p.month, p] as const));
  return [...keys]
    .sort((a, b) => b.localeCompare(a))
    .map((month) => ({ month, stripe: stripeBy.get(month) ?? null, portal: portalBy.get(month) ?? null }));
}

export function Kpis() {
  const [monthly, setMonthly] = useState<MonthlyKpis[] | null>(null);
  const [portal, setPortal] = useState<PortalCountsPayload | null>(null);
  const [coverage, setCoverage] = useState<CoveragePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getMonthlyKpis(MONTHS_SHOWN).then(setMonthly).catch((e: Error) => setError(e.message));
    getPortalCounts().then(setPortal).catch((e: Error) => setError(e.message));
    getCoverage().then(setCoverage).catch((e: Error) => setError(e.message));
  }, []);

  async function refreshPortal(): Promise<void> {
    setRefreshing(true);
    try {
      setPortal(await getPortalCounts(true));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  if (error !== null) return <div className="card dim">{error}</div>;

  const portalMonths = portal !== null && portal.configured && !('error' in portal) ? portal.months : null;
  const portalLevels = portal !== null && portal.configured && !('error' in portal) ? portal.levels : [];
  const rows = monthly === null ? [] : joinMonths(monthly, portalMonths);

  return (
    <>
      <StripeCard rows={rows} loading={monthly === null} portalReady={portalMonths !== null} />
      <PortalCard payload={portal} levels={portalLevels} onRefresh={refreshPortal} refreshing={refreshing} />
      <CoverageCard payload={coverage} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Stripe-visible enrollments — incomplete on its face               */
/* ------------------------------------------------------------------ */

function StripeCard({ rows, loading, portalReady }: { rows: MonthRow[]; loading: boolean; portalReady: boolean }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Enrollments we can see (Stripe)</div>
        <span className="badge amber">incomplete — Stripe only</span>
      </div>
      <div className="dim" style={{ marginBottom: 14, maxWidth: 640 }}>
        Only card payments through Checkout land here. E-transfer and manual invoices never do, so this is a floor,
        not a count of students. The portal column is the real number for the same month; the gap is what Stripe
        cannot see.
      </div>
      {loading ? (
        <div className="dim">Loading…</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Seen by Stripe</th>
              <th>Revenue we can see (Stripe)</th>
              <th>In the portal</th>
              <th>Gap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <GapRow key={r.month} row={r} portalReady={portalReady} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GapRow({ row, portalReady }: { row: MonthRow; portalReady: boolean }) {
  const stripeCount = row.stripe?.enrollments ?? 0;
  const portalCount = row.portal === null ? null : row.portal.total.new + row.portal.total.renewed;
  const beforePortal = row.month < PORTAL_FROM;
  const gap = portalCount === null ? null : portalCount - stripeCount;
  const gapPct = gap === null || portalCount === null || portalCount === 0 ? null : Math.round((gap / portalCount) * 100);
  return (
    <tr>
      <td>{monthLabel(row.month)}</td>
      <td>{row.stripe === null ? <span className="dim">0</span> : stripeCount}</td>
      <td>{row.stripe === null ? <span className="dim">—</span> : dollars(row.stripe.revenueCents)}</td>
      <td>
        {beforePortal ? (
          <span className="dim">not tracked before Sept 2026</span>
        ) : !portalReady ? (
          <span className="dim">portal not connected</span>
        ) : portalCount === null ? (
          <span className="dim">0</span>
        ) : (
          portalCount
        )}
      </td>
      <td>{gap === null ? <span className="dim">—</span> : <GapBar gap={gap} pct={gapPct} />}</td>
    </tr>
  );
}

/** The B2 finder: how much of the month Stripe misses, as a bar so the worst months jump out. */
function GapBar({ gap, pct }: { gap: number; pct: number | null }) {
  if (gap <= 0) return <span className="badge green">Stripe sees everything</span>;
  const width = pct === null ? 0 : Math.min(100, pct);
  const colour = pct !== null && pct >= 50 ? 'var(--red)' : 'var(--amber)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 120, height: 8, background: 'var(--panel2)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${width}%`, height: '100%', background: colour }} />
      </div>
      <span style={{ color: colour, fontWeight: 600 }}>
        {gap} missing{pct === null ? '' : ` (${pct}%)`}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Portal students — the real picture, handed over numbers-only     */
/* ------------------------------------------------------------------ */

function PortalCard({
  payload,
  levels,
  onRefresh,
  refreshing,
}: {
  payload: PortalCountsPayload | null;
  levels: string[];
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Students in the portal</div>
        <span className="dim">from Sept 2026 · by level · new vs renewed · how they paid</span>
        <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onRefresh} disabled={refreshing || payload === null}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className="dim" style={{ marginBottom: 14, maxWidth: 640 }}>
        The portal hands over counts only — never a name. Levels appear as students are set to them (L1.5 shows up
        the moment someone is on it).
      </div>
      <PortalBody payload={payload} levels={levels} />
    </div>
  );
}

function PortalBody({ payload, levels }: { payload: PortalCountsPayload | null; levels: string[] }) {
  if (payload === null) return <div className="dim">Loading…</div>;
  if (!payload.configured) {
    return (
      <div className="dim">
        Not connected yet. Set <code>PORTAL_FUNCTIONS_URL</code> on the analyst-dash service and deploy the portal's{' '}
        <code>dash-counts</code> function.
      </div>
    );
  }
  if ('error' in payload) {
    return (
      <div className="dim">
        The portal did not answer ({payload.error}
        {payload.status === undefined ? '' : ` ${payload.status}`}). Is <code>dash-counts</code> deployed with the
        same secret?
      </div>
    );
  }
  if (payload.months.length === 0) return <div className="dim">No students with a plan starting on or after Sept 2026 yet.</div>;

  return (
    <>
      {payload.months.map((m) => (
        <PortalMonthBlock key={m.month} month={m} levels={levels} />
      ))}
      <div className="hint">
        Renewals are exact from {payload.renewalsExactSince === null ? 'the first plan change onward (none recorded yet)' : monthLabel(payload.renewalsExactSince)}
        ; earlier months are estimated from account age. Each month is marked.
        {payload.cached ? ' Cached — Refresh for live numbers.' : ''}
      </div>
    </>
  );
}

function PortalMonthBlock({ month, levels }: { month: PortalMonth; levels: string[] }) {
  const sources = Object.entries(month.total.bySource).sort((a, b) => b[1] - a[1]);
  const students = month.total.new + month.total.renewed;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>{monthLabel(month.month)}</div>
        <span>{students} students</span>
        <span className={`badge ${month.renewalsMode === 'exact' ? 'green' : 'amber'}`}>
          renewals {month.renewalsMode}
        </span>
        {month.total.legacy > 0 ? <span className="dim">{month.total.legacy} legacy import</span> : null}
      </div>
      <table>
        <thead>
          <tr>
            <th>Level</th>
            <th>New</th>
            <th>Renewed</th>
            <th>Students</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((level) => {
            const b = month.byLevel[level];
            if (b === undefined) return null;
            return (
              <tr key={level}>
                <td>{levelLabel(level)}</td>
                <td>{b.new}</td>
                <td>{b.renewed === 0 ? <span className="dim">0</span> : b.renewed}</td>
                <td>{b.new + b.renewed}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="hint" style={{ marginTop: 8 }}>
        Paid by:{' '}
        {sources.map(([source, n], i) => (
          <span key={source}>
            {i > 0 ? ' · ' : ''}
            {sourceLabel(source)} {n}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. KPI 3 — videos analysed per week                                 */
/* ------------------------------------------------------------------ */

function CoverageCard({ payload }: { payload: CoveragePayload | null }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Videos analysed per week</div>
        {payload === null ? null : (
          <span className="dim">
            goal {payload.goalPerWeek}/week · {payload.totals.analysed} of {payload.totals.videos} videos analysed so far
          </span>
        )}
      </div>
      <div className="dim" style={{ marginBottom: 14, maxWidth: 640 }}>
        Counted from the analysis form, by the week each video was posted. A week is green when at least the goal
        number of that week's videos have an analysis.
      </div>
      {payload === null ? (
        <div className="dim">Loading…</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Week of</th>
              <th>Posted</th>
              <th>Analysed</th>
              <th>By platform</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {payload.weeks.map((w) => (
              <tr key={w.weekStart}>
                <td>{w.weekStart}</td>
                <td>{w.posted === 0 ? <span className="dim">0</span> : w.posted}</td>
                <td>{w.analysed === 0 ? <span className="dim">0</span> : w.analysed}</td>
                <td className="dim">
                  {Object.entries(w.byPlatform)
                    .map(([p, n]) => `${p} ${n.analysed}/${n.posted}`)
                    .join(' · ') || '—'}
                </td>
                <td>
                  {w.posted === 0 ? (
                    <span className="dim">nothing posted</span>
                  ) : w.goalMet ? (
                    <span className="badge green">on goal</span>
                  ) : (
                    <span className="badge red">{payload.goalPerWeek - w.analysed} short</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
