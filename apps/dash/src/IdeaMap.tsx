import { useEffect, useMemo, useState } from 'react';
import { getInsights, getJson, type IdeaEdge, type InsightsPayload, type SuggestionRow } from './api.js';

export function IdeaMap() {
  const [rows, setRows] = useState<SuggestionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SuggestionRow | null>(null);
  /** X6: suggestion → source videos → outcome, from the latest insights run. */
  const [insights, setInsights] = useState<InsightsPayload | null>(null);

  useEffect(() => {
    getJson<SuggestionRow[]>('/api/suggestions').then(setRows).catch((e: Error) => setError(e.message));
    getInsights().then(setInsights).catch(() => setInsights(null));
  }, []);

  const edgeById = useMemo(() => {
    const map = new Map<string, IdeaEdge>();
    for (const e of insights?.run?.report.edges ?? []) map.set(e.suggestionId, e);
    return map;
  }, [insights]);
  const videoLabel = (id: string): string => {
    const v = insights?.videos[id];
    return v === undefined ? id : `[${v.platform}] ${v.title ?? v.platformVideoId}`;
  };

  const groups = useMemo(() => {
    const map = new Map<string, SuggestionRow[]>();
    for (const s of rows ?? []) {
      const key = s.hypothesis ?? 'untagged';
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [rows]);

  if (error !== null) return <div className="card dim">API error: {error}</div>;
  if (rows === null) return <div className="card dim">Loading…</div>;
  if (rows.length === 0) return <div className="card dim">No suggestions yet — run pnpm suggest.</div>;

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ flex: 2 }}>
        {groups.map(([group, items]) => (
          <div className="card" key={group}>
            <div className="dim" style={{ marginBottom: 10, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
              {group} · {items.length}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {items.map((s) => {
                const ok = s.status === 'surfaced' || s.status === 'posted';
                const active = selected?.id === s.id;
                return (
                  <button key={s.id} onClick={() => setSelected(s)}
                    style={{
                      padding: '10px 14px', borderRadius: 999, cursor: 'pointer', font: 'inherit', fontSize: 13,
                      background: active ? 'var(--accent)' : 'var(--panel2)',
                      border: `1px solid ${ok ? 'var(--accent2)' : 'var(--red)'}`,
                      color: active ? '#fff' : 'var(--text)', maxWidth: 230,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                    title={s.payload.theme ?? ''}>
                    {s.payload.theme ?? '(no theme)'}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="card dim" style={{ fontSize: 12 }}>
          Nodes are suggestions, grouped by hypothesis tag. Purple border = surfaced, red = rejected. Click a node to see
          its X6 edges: source videos (same tag, posted before) → outcome videos (auto-matched: idea source "AI agent", posted
          after, same tag or format). Outcomes are never confirmed by a person — the match is automatic.
        </div>
      </div>
      <div style={{ flex: 1, position: 'sticky', top: 28 }}>
        {selected === null ? (
          <div className="card dim">Click a node to inspect it.</div>
        ) : (
          <div className="card">
            <strong>{selected.payload.theme}</strong>
            <div style={{ marginTop: 8 }}><span className="dim">Hook:</span> {selected.payload.hook ?? '—'}</div>
            <div><span className="dim">Format:</span> {selected.payload.format ?? '—'}</div>
            <div><span className="dim">Status:</span> {selected.status}</div>
            <div style={{ marginTop: 8 }} className="dim">{selected.payload.rationale ?? ''}</div>
            {(() => {
              const e = edgeById.get(selected.id);
              if (e === undefined) return <div className="dim" style={{ marginTop: 10, fontSize: 12 }}>No insights run yet — edges appear after the first run.</div>;
              return (
                <div style={{ marginTop: 10, fontSize: 13 }}>
                  <div className="dim" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Source videos ({e.sourceVideoIds.length})</div>
                  {e.sourceVideoIds.length === 0 ? <div className="dim">none — suggestion has no hypothesis tag or no earlier tagged videos</div> : null}
                  {e.sourceVideoIds.slice(0, 8).map((id) => <div key={id}>{videoLabel(id)}</div>)}
                  <div className="dim" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 }}>
                    Outcome ({e.outcomes.length}) <span className="badge amber">auto-matched</span>
                  </div>
                  {e.outcomes.length === 0 ? <div className="dim">no AI-agent video matched yet</div> : null}
                  {e.outcomes.map((o) => (
                    <div key={o.contentId}>
                      {o.verdict === 'above_median' ? <span className="badge green">above median</span> : o.verdict === 'below_median' ? <span className="badge red">below median</span> : <span className="badge">unscored</span>}{' '}
                      {videoLabel(o.contentId)} <span className="dim">({o.engagementRatePct === null ? 'n/a' : `${o.engagementRatePct}%`} vs {o.platformMedianPct ?? 'n/a'}%, via {o.matchedOn})</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}