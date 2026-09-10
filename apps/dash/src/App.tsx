import { useEffect, useState } from 'react';
import { getMe, type Me } from './api.js';
import { Suggestions } from './Suggestions.js';
import { Performance } from './Performance.js';
import { Analysis } from './Analysis.js';
import { Kpis } from './Kpis.js';
import { RunLog } from './RunLog.js';
import { IdeaMap } from './IdeaMap.js';

const ALL_PANELS = ['Analysis', 'Suggestions', 'Idea map', 'Performance', 'KPIs', 'Run log'] as const;
type Panel = (typeof ALL_PANELS)[number];

/**
 * X0 role permissions (locked, docs/spec/x-series.md):
 *   owner     — everything
 *   marketing — Analysis (X1), Suggestions, Idea map, Performance.
 *               No revenue anywhere, no Run log.
 * The API enforces this on every route; this list only decides what to draw.
 */
const PANELS_BY_ROLE: Record<Me['role'], readonly Panel[]> = {
  owner: ALL_PANELS,
  marketing: ['Analysis', 'Suggestions', 'Idea map', 'Performance'],
};

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('Analysis');

  useEffect(() => {
    getMe().then(setMe).catch((e: Error) => setError(e.message));
  }, []);

  if (error !== null) return <div className="card dim" style={{ margin: 28 }}>{error}</div>;
  if (me === null) return <div className="card dim" style={{ margin: 28 }}>Loading…</div>;

  const panels = PANELS_BY_ROLE[me.role];
  const current: Panel = panels.includes(panel) ? panel : panels[0] ?? 'Suggestions';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">French with Jas · Analyst</div>
        {panels.map((p) => (
          <button key={p} className={`nav-item ${p === current ? 'active' : ''}`} onClick={() => setPanel(p)}>
            {p}
          </button>
        ))}
        <div className="dim" style={{ marginTop: 20, padding: '0 10px', fontSize: 12, wordBreak: 'break-all' }}>
          {me.email}
          <br />
          {me.role}
        </div>
      </aside>
      <main className="main">
        <div className="h1">{current}</div>
        {current === 'Analysis' ? <Analysis /> :
         current === 'Suggestions' ? <Suggestions /> :
         current === 'Idea map' ? <IdeaMap /> :
         current === 'Performance' ? <Performance /> :
         current === 'KPIs' ? <Kpis /> :
         <RunLog />}
      </main>
    </div>
  );
}
