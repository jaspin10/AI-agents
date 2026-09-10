import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMetrics, type MetricsPayload, type MetricsVideo, type VelocitySlot } from './api.js';

/**
 * X2 — derived metrics (docs/spec/x-series.md, X2). Everything here is computed
 * server-side by @platform/shared/metrics; this panel only renders, and it
 * renders the honesty markers with the numbers:
 *   - velocity: "(day 5)" when the slot is approximate; "too new" / "no snapshot" instead of a figure
 *   - follower-normalised: the snapshot date the follower count came from
 *   - ad split: the TIME-split label travels in the payload and is printed beside the numbers
 * Platform list is derived from the data — never hardcoded (X1 rule).
 */

const fmtPct = (v: number | null): string => (v === null ? 'n/a' : `${v.toFixed(2)}%`);
const fmtNum = (v: number | null): string => (v === null ? '—' : v.toLocaleString());

function slot(s: VelocitySlot) {
  if (s.status === 'too_new') return <span className="dim" title="Video is younger than this many days">too new</span>;
  if (s.status === 'no_snapshot') return <span className="dim" title="No snapshot exists at or before this day">no snapshot</span>;
  if (s.status === 'exact') return <span>{s.views.toLocaleString()}</span>;
  return (
    <span title={`No snapshot on the exact day — nearest earlier one, from day ${s.day}`}>
      {s.views.toLocaleString()} <span className="badge amber">day {s.day}</span>
    </span>
  );
}

function AdSplitCell({ v }: { v: MetricsVideo }) {
  const a = v.adSplit;
  if (a.runsUsed === 0 && a.runsIgnoredNoStart === 0) return <span className="dim">no ad runs</span>;
  if (!a.computable) return <span className="dim" title={a.label}>{a.runsIgnoredNoStart > 0 && a.runsUsed === 0 ? 'runs have no start date' : 'needs 2+ snapshots'}</span>;
  return (
    <span title={a.label}>
      <span className="badge amber">time split</span> in {a.insideAdWindows.toLocaleString()} · out {a.outsideAdWindows.toLocaleString()}
      {a.unattributedBeforeFirstSnapshot > 0 ? <span className="dim"> · {a.unattributedBeforeFirstSnapshot.toLocaleString()} before first snapshot</span> : null}
      {a.runsIgnoredNoStart > 0 ? <span className="dim"> · {a.runsIgnoredNoStart} run(s) ignored, no start date</span> : null}
    </span>
  );
}

function VideoCard({ v, byId }: { v: MetricsVideo; byId: Map<string, MetricsVideo> }) {
  const twins = v.twinIds.map((id) => byId.get(id)).filter((t): t is MetricsVideo => t !== undefined);
  const cols = [v, ...twins];
  const row = (label: string, cell: (x: MetricsVideo) => ReactNode) => (
    <tr>
      <td className="dim">{label}</td>
      {cols.map((x) => <td key={x.id}>{cell(x)}</td>)}
    </tr>
  );
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{v.title ?? '(untitled)'}</div>
      <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
        posted {v.postedAt.slice(0, 10)} · {v.snapshotCount} snapshot{v.snapshotCount === 1 ? '' : 's'}
        {v.latestCapturedDate !== null ? ` · latest ${v.latestCapturedDate}` : ''}
        {twins.length > 0 ? ` · ${twins.length} cross-platform twin${twins.length === 1 ? '' : 's'}` : ''}
      </div>
      <table>
        <thead>
          <tr>
            <th />
            {cols.map((x) => <th key={x.id}>{x.platform}{x.id !== v.id ? <span className="dim"> (twin)</span> : null}</th>)}
          </tr>
        </thead>
        <tbody>
          {row('Views', (x) => fmtNum(x.views))}
          {row('Comment rate', (x) => fmtPct(x.rates?.commentRatePct ?? null))}
          {row('Share rate', (x) => fmtPct(x.rates?.shareRatePct ?? null))}
          {row('Engagement rate', (x) => fmtPct(x.rates?.engagementRatePct ?? null))}
          {row('Views day 1', (x) => slot(x.velocity.day1))}
          {row('Views day 7', (x) => slot(x.velocity.day7))}
          {row('Views day 30', (x) => slot(x.velocity.day30))}
          {row('Views ÷ followers', (x) => (
            x.followerNormalised.viewsPerFollower === null
              ? <span className="dim">no follower count</span>
              : <span title={`followers ${x.followerNormalised.followers?.toLocaleString()} as of ${x.followerNormalised.followersFromDate}`}>
                  {x.followerNormalised.viewsPerFollower.toFixed(3)} <span className="dim">(followers from {x.followerNormalised.followersFromDate})</span>
                </span>
          ))}
          {row('Ad window split', (x) => <AdSplitCell v={x} />)}
        </tbody>
      </table>
    </div>
  );
}

export function Metrics() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>('all');
  const [onlyTwins, setOnlyTwins] = useState(false);

  useEffect(() => {
    getMetrics().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  const byId = useMemo(() => new Map((data?.videos ?? []).map((v) => [v.id, v] as const)), [data]);
  const platforms = useMemo(() => ['all', ...new Set((data?.videos ?? []).map((v) => v.platform))], [data]);
  const visible = useMemo(() => {
    const vids = data?.videos ?? [];
    return vids.filter((v) => (platform === 'all' || v.platform === platform) && (!onlyTwins || v.twinIds.length > 0));
  }, [data, platform, onlyTwins]);

  if (error !== null) return <div className="card dim">API error: {error}</div>;
  if (data === null) return <div className="card dim">Loading…</div>;

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button key={label} type="button" className={`chip ${active ? 'active' : ''}`} onClick={onClick}>{label}</button>
  );

  return (
    <div>
      <div className="card">
        <div className="chips">
          {platforms.map((p) => chip(p, p === platform, () => setPlatform(p)))}
          <span className="dim" style={{ margin: '0 6px' }}>|</span>
          {chip('With twins only', onlyTwins, () => setOnlyTwins(!onlyTwins))}
        </div>
        <div className="dim" style={{ fontSize: 12 }}>
          {visible.length} videos · computed {data.today}. Rates are from the latest snapshot; "n/a" = the platform does not report that metric.
          Velocity uses the nearest earlier snapshot when the exact day is missing (amber badge shows the real day).
        </div>
        <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
          <span className="badge amber">time split</span> {data.adSplitLabel}
        </div>
      </div>
      {visible.map((v) => <VideoCard key={v.id} v={v} byId={byId} />)}
    </div>
  );
}
