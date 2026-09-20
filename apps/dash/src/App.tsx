import { useEffect, useState } from 'react';
import { getMe, type Me } from './api.js';
import { Suggestions } from './Suggestions.js';
import { Performance } from './Performance.js';
import { Analysis } from './Analysis.js';
import { Kpis } from './Kpis.js';
import { RunLog } from './RunLog.js';
import { IdeaMap } from './IdeaMap.js';
import { Metrics } from './Metrics.js';
import { Insights } from './Insights.js';

const ALL_PANELS = ['Analysis', 'Metrics', 'Insights', 'Suggestions', 'Idea map', 'Performance', 'KPIs', 'Run log'] as const;
type Panel = (typeof ALL_PANELS)[number];

/**
 * X0 role permissions (locked, docs/spec/x-series.md):
 *   owner     — everything
 *   marketing — Analysis (X1), Metrics (X2), Insights (X6), Suggestions, Idea map, Performance.
 *               No revenue anywhere, no Run log.
 * The API enforces this on every route; this list only decides what to draw.
 */
const PANELS_BY_ROLE: Record<Me['role'], readonly Panel[]> = {
  owner: ALL_PANELS,
  marketing: ['Analysis', 'Metrics', 'Insights', 'Suggestions', 'Idea map', 'Performance'],
};

const PANEL_COPY: Record<Panel, string> = {
  Analysis: 'Give every video the context that makes your next decision better.',
  Metrics: 'Compare video results, snapshots and cross-platform twins.',
  Insights: 'Understand the patterns in your content, with the evidence in view.',
  Suggestions: 'Turn audience questions into reviewed ideas, briefs and videos.',
  'Idea map': 'Explore the connections between suggestions and their evidence.',
  Performance: 'Review your published videos and compare their latest results.',
  KPIs: 'Follow enrollment visibility and your weekly analysis progress.',
  'Run log': 'Review agent activity, outcomes and errors.',
};
const PANEL_ICONS: Record<Panel, string> = {
  Analysis: '▤', Metrics: '▥', Insights: '◈', Suggestions: '✦',
  'Idea map': '◎', Performance: '↗', KPIs: '◷', 'Run log': '≡',
};

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('Analysis');

  useEffect(() => {
    getMe().then(setMe).catch((e: Error) => setError(e.message));
  }, []);

  if (error !== null) return <div className="card session-state" role="alert"><h1>Unable to open your workspace</h1><p>{error}</p><button className="btn" onClick={() => window.location.reload()}>Try again</button></div>;
  if (me === null) return <div className="card session-state" role="status"><span className="eyebrow">French with Jas</span><h1>Opening your workspace…</h1><p className="dim">Checking your session.</p></div>;

  const panels = PANELS_BY_ROLE[me.role];
  const current: Panel = panels.includes(panel) ? panel : panels[0] ?? 'Suggestions';

  return (
    <div className="layout">
      <aside className="sidebar">
        <a className="skip-link" href="#main-content">Skip to content</a>
        <div className="logo"><span className="brand-mark" aria-hidden="true">J.</span><div>French with Jas<span>Marketing workspace</span></div></div>
        <nav aria-label="Marketing workspace">
          <div className="nav-label">Workspace</div>
          {panels.map((p) => (
            <button key={p} className={`nav-item ${p === current ? 'active' : ''}`} aria-current={p === current ? 'page' : undefined} onClick={() => setPanel(p)}>
              <span className="nav-icon" aria-hidden="true">{PANEL_ICONS[p]}</span>{p}
            </button>
          ))}
        </nav>
        <div className="sidebar-account"><span className="account-avatar" aria-hidden="true">{me.email.slice(0, 1).toUpperCase()}</span><div><span className="account-email" title={me.email}>{me.email}</span><span className="account-role">{me.role} workspace</span></div></div>
      </aside>
      <main className="main" id="main-content" tabIndex={-1}>
        <header className="page-header"><div><div className="eyebrow">French with Jas / Marketing</div><h1>{current}</h1><p>{PANEL_COPY[current]}</p></div><span className="workspace-badge">Human-led creative work</span></header>
        {current === 'Analysis' ? <Analysis /> :
         current === 'Metrics' ? <Metrics /> :
         current === 'Insights' ? <Insights /> :
         current === 'Suggestions' ? <Suggestions /> :
         current === 'Idea map' ? <IdeaMap /> :
         current === 'Performance' ? <Performance /> :
         current === 'KPIs' ? <Kpis /> :
         <RunLog />}
      </main>
    </div>
  );
}
