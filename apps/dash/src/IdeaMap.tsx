import { useEffect, useMemo, useState } from 'react';
import { getJson, type SuggestionRow } from './api.js';

export function IdeaMap() {
  const [rows, setRows] = useState<SuggestionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SuggestionRow | null>(null);

  useEffect(() => {
    getJson<SuggestionRow[]>('/api/suggestions').then(setRows).catch((e: Error) => setError(e.message));
  }, []);

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
          Nodes are suggestions, grouped by hypothesis tag. Purple border = surfaced, red = rejected. Edges to source
          videos and outcomes arrive with the M5+ feedback loop (posted/skipped → performance).
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
          </div>
        )}
      </div>
    </div>
  );
}