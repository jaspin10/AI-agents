import { useEffect, useState } from 'react';
import { getJson, type SuggestionRow } from './api.js';

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

  useEffect(() => {
    getJson<SuggestionRow[]>('/api/suggestions').then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  if (error !== null) return <div className="card dim">API error: {error} — is the API running? (pnpm dash)</div>;
  if (rows === null) return <div className="card dim">Loading…</div>;
  if (rows.length === 0) return <div className="card dim">No suggestions yet — run pnpm suggest.</div>;

  return (
    <>
      {rows.map((s) => (
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
          <div style={{ marginTop: 8, fontSize: 12 }} className="dim">{new Date(s.createdAt).toLocaleString()}</div>
        </div>
      ))}
    </>
  );
}