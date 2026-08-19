import { useState } from 'react';
import { Suggestions } from './Suggestions.js';
import { Performance } from './Performance.js';
import { Kpis } from './Kpis.js';
import { RunLog } from './RunLog.js';
import { IdeaMap } from './IdeaMap.js';

const PANELS = ['Suggestions', 'Idea map', 'Performance', 'KPIs', 'Run log'] as const;
type Panel = (typeof PANELS)[number];

export function App() {
  const [panel, setPanel] = useState<Panel>('Suggestions');
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">French with Jas · Analyst</div>
        {PANELS.map((p) => (
          <button key={p} className={`nav-item ${p === panel ? 'active' : ''}`} onClick={() => setPanel(p)}>
            {p}
          </button>
        ))}
      </aside>
      <main className="main">
        <div className="h1">{panel}</div>
        {panel === 'Suggestions' ? <Suggestions /> :
         panel === 'Idea map' ? <IdeaMap /> :
         panel === 'Performance' ? <Performance /> :
         panel === 'KPIs' ? <Kpis /> :
         <RunLog />}
      </main>
    </div>
  );
}