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
    const latest = new Map<string, PerformanceRecord>();
    for (const p of data.performance) {
      const existing = latest.get(p.contentId);
      if (existing === undefined || p.capturedDate > existing.capturedDate) latest.set(p.contentId, p);
    }
    const out: VideoRow[] = [];
    for (const c of data.content) {
      if (c.id === undefined) continue;
      const p = latest.get(c.platformVideoId);
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
          <button key={p} className={`nav-item ${p === platform ? 'active' : ''}`}
            style={{ display: 'inline-block', width: 'auto', marginRight: 6 }}
            onClick={() => setPlatform(p)}>
            {p}
          </button>
        ))}
        <span className="dim" style={{ marginLeft: 8 }}>{visible.length} videos · click headers to sort</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Platform</th>
            <th>Title</th>
            <th onClick={() => setSortKey('views')}>Views {sortKey === 'views' ? '▾' : ''}</th>
            <th onClick={() => setSortKey('engagementPct')}>Engagement {sortKey === 'engagementPct' ? '▾' : ''}</th>
            <th onClick={() => setSortKey('sharePct')}>Share rate {sortKey === 'sharePct' ? '▾' : ''}</th>
            <th onClick={() => setSortKey('retentionPct')}>Retention {sortKey === 'retentionPct' ? '▾' : ''}</th>
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
      </table>
    </div>
  );
}