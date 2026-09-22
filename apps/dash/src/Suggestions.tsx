import { BrainLink } from './brain-ui.js';
import { useEffect, useState } from 'react';
import { getJson, setSuggestionStatus, type SuggestionRow } from './api.js';

function CheckBadge({ label, passed, reasons }: { label: string; passed: boolean; reasons: string[] }) {
  return (
    <span className={`badge ${passed ? 'green' : 'red'}`} title={reasons.join('; ')}>
      {label} {passed ? 'PASS' : 'FAIL'}
    </span>
  );
}

const STATUS_COLOR: Record<SuggestionRow['status'], string> = {
  surfaced: 'amber', posted: 'green', skipped: 'red', rejected: 'red',
};

export function Suggestions() {
  const [rows, setRows] = useState<SuggestionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit,setLimit]=useState(30);
  const selectedId=new URLSearchParams(window.location.search).get('id');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    getJson<SuggestionRow[]>('/api/suggestions').then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  async function flip(id: string, status: 'posted' | 'skipped'): Promise<void> {
    setBusy(id);
    try {
      await setSuggestionStatus(id, status);
      setRows((current) =>
        current === null ? null : current.map((r) => (r.id === id ? { ...r, status } : r))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (error !== null) return <div className="card dim">Unable to load suggestions: {error}</div>;
  if (rows === null) return <div className="card dim">Loading…</div>;


  return (
    <>
      <div className="creative-path"><BrainLink to={{view:'audience'}}>01 / Audience evidence ↗</BrainLink><BrainLink to={{view:'briefs'}}>02 / Shape a brief ↗</BrainLink><BrainLink to={{view:'production'}}>03 / Production & review ↗</BrainLink></div>
      <div className="section-heading"><h2>Suggestions <span className="count-badge">{rows.length}</span></h2><p className="dim">Review the hook, rationale and evidence before taking action.</p></div>
      {rows.length===0 && <div className="card empty-state"><strong>No suggestions yet</strong><p>You can still collect audience questions and prepare a brief in the Briefs view.</p></div>}
      {selectedId&&!rows.some(s=>s.id===selectedId)&&<div className="card" role="status">This suggestion is unavailable. <BrainLink to={{view:'suggestions'}}>View all ideas</BrainLink></div>}
      {rows.filter(s=>!selectedId||s.id===selectedId).slice(0,limit).map((s) => (
        <div className="card" key={s.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong>{s.payload.theme ?? '(no theme)'}</strong>
            <span>
              <span className={`badge ${STATUS_COLOR[s.status]}`}>{s.status}</span>{' '}
              <CheckBadge label="banned-topics" passed={s.bannedTopicsPassed} reasons={s.bannedTopicsReasons} />{' '}
              <CheckBadge label="brand-voice" passed={s.brandVoicePassed} reasons={s.brandVoiceReasons} />
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span className="dim">Hook:</span> {s.payload.hook ?? '—'}
          </div>
          <div><span className="dim">Format:</span> {s.payload.format ?? '—'}</div>
          <div><span className="dim">Hypothesis:</span> {s.hypothesis ?? 'untagged'}</div>
          <div style={{ marginTop: 8 }} className="dim">{s.payload.rationale ?? ''}</div>
          <details><summary>Evidence · {s.payload.evidenceMode ?? 'historical inferred / unverified'}</summary><p>Content: {s.payload.evidenceContentIds?.join(', ') ?? 'not recorded'} · Insight run: {s.payload.insightRunId ?? 'none'}</p><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(s.payload.evidenceSnapshot ?? {notice:'No recorded prompt evidence for this historical suggestion.'}, null, 2)}</pre></details>
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12 }} className="dim">{new Date(s.createdAt).toLocaleString()}</span>
            {['surfaced','posted'].includes(s.status)&&<BrainLink to={{view:'briefs',idea:s.id}} className="btn">Shape this idea into a brief ↗</BrainLink>}
            {s.status === 'surfaced' ? (
              <span style={{ display: 'flex', gap: 8 }}>
                <button className="btn" disabled={busy === s.id} onClick={() => void flip(s.id, 'posted')}>
                  ✓ Posted
                </button>
                <button className="btn" disabled={busy === s.id} onClick={() => void flip(s.id, 'skipped')}>
                  ✗ Skipped
                </button>
              </span>
            ) : null}
          </div>
        </div>
      ))}
      {!selectedId&&rows.length>limit&&<button className="btn" onClick={()=>setLimit(n=>n+30)}>Show more ideas</button>}
    </>
  );
}