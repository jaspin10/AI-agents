import { useEffect, useMemo, useState } from 'react';
import { getJson, type ContentRow, type PerformanceRecord } from './api.js';

interface VideoRow {
  platform: string;
  title: string;
  views: number;
  engagementPct: number | null;
  sharePct: number | null;
  retentionPct: number | null;
  hypothesis: string | null;
}

type SortKey = 'views' | 'engagementPct' | 'sharePct' | 'retentionPct';

export function Performance() {
  const [data, setData] = useState<{ content: ContentRow[]; performance: PerformanceRecord[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('views');

  useEffect(() => {
    getJson<{ content: ContentRow[]; performance: PerformanceRecord[] }>('/api/content-performance')
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const rows = useMemo<VideoRow[]>(() => {
    if (data === null) return [];
    // X2 (migration 0009): join on content UUID; native-id fallback only for a row the trigger couldn't resolve.
    const uuidByNative = new Map(data.content.filter((c) => c.id !== undefined).map((c) => [c.platformVideoId, c.id as string] as const));
    const latest = new Map<string, PerformanceRecord>();
    for (const p of data.performance) {
      const key = p.contentUuid ?? uuidByNative.get(p.contentId);
      if (key === undefined) continue;
      const existing = latest.get(key);
      if (existing === undefined || p.capturedDate > existing.capturedDate) latest.set(key, p);
    }
    const out: VideoRow[] = [];
    for (const c of data.content) {
      if (c.id === undefined) continue;
      const p = latest.get(c.id);
      if (p === undefined) continue;
      const m = p.metrics;
      out.push({
        platform: c.platform,
        title: c.title ?? '(untitled)',
        views: m.views,
        engagementPct: m.views > 0 ? ((m.likes + m.comments + m.shares) / m.views) * 100 : null,
        sharePct: m.views > 0 ? (m.shares / m.views) * 100 : null,
        retentionPct: m.retentionPct,
        hypothesis: c.hypothesis,
      });
    }
    return out;
  }, [data]);

  const visible = useMemo(() => {
    const filtered = platform === 'all' ? rows : rows.filter((r) => r.platform === platform);
    return [...filtered].sort((a, b) => (b[sortKey] ?? -1) - (a[sortKey] ?? -1));
  }, [rows, platform, sortKey]);

  if (error !== null) return <div className="card dim">API error: {error}</div>;
  if (data === null) return <div className="card dim">Loading…</div>;

  const platforms = ['all', ...new Set(rows.map((r) => r.platform))];
  const pct = (v: number | null): string => (v === null ? '—' : `${v.toFixed(2)}%`);

  return (
    <div className="card">
      <div style={{ marginBottom: 12 }}>
        {platforms.map((p) => (
          <button key={p} className={`chip ${p === platform ? 'active' : ''}`} aria-pressed={p === platform}
            style={{ display: 'inline-block', width: 'auto', marginRight: 6 }}
            onClick={() => setPlatform(p)}>
            {p}
          </button>
        ))}
        <span className="dim" style={{ marginLeft: 8 }}>{visible.length} videos · click headers to sort</span>
      </div>
      <div className="table-scroll" role="region" aria-label="Scrollable performance table" tabIndex={0}><table>
        <thead>
          <tr>
            <th>Platform</th>
            <th>Title</th>
            <th aria-sort={sortKey === 'views' ? 'descending' : 'none'}><button className="sort-button" onClick={() => setSortKey('views')}>Views {sortKey === 'views' ? '▾' : '↕'}</button></th>
            <th aria-sort={sortKey === 'engagementPct' ? 'descending' : 'none'}><button className="sort-button" onClick={() => setSortKey('engagementPct')}>Engagement {sortKey === 'engagementPct' ? '▾' : '↕'}</button></th>
            <th aria-sort={sortKey === 'sharePct' ? 'descending' : 'none'}><button className="sort-button" onClick={() => setSortKey('sharePct')}>Share rate {sortKey === 'sharePct' ? '▾' : '↕'}</button></th>
            <th aria-sort={sortKey === 'retentionPct' ? 'descending' : 'none'}><button className="sort-button" onClick={() => setSortKey('retentionPct')}>Retention {sortKey === 'retentionPct' ? '▾' : '↕'}</button></th>
            <th>Tag</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => (
            <tr key={i}>
              <td>{r.platform}</td>
              <td style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.title}>{r.title}</td>
              <td>{r.views.toLocaleString()}</td>
              <td>{pct(r.engagementPct)}</td>
              <td>{pct(r.sharePct)}</td>
              <td>{r.retentionPct === null ? '—' : `${r.retentionPct.toFixed(1)}%`}</td>
              <td className="dim">{r.hypothesis ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {visible.length === 0 && <div className="empty-state"><strong>No performance snapshots yet</strong><p>Results appear after published videos have been synced.</p></div>}
    </div>
  );
}
