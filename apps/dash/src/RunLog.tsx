import { useEffect, useState } from 'react';
import { getJson } from './api.js';

interface LogRow {
  runId: string;
  taskId: string | null;
  agent: string;
  tool: string;
  status: 'ok' | 'rejected' | 'error';
  error: string | null;
  startedAt: string;
  finishedAt: string;
}

const STATUS_BADGE: Record<LogRow['status'], string> = { ok: 'green', rejected: 'amber', error: 'red' };

export function RunLog() {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJson<LogRow[]>('/api/logs').then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  if (error !== null) return <div className="card dim">API error: {error}</div>;
  if (rows === null) return <div className="card dim">Loading…</div>;
  if (rows.length === 0) return <div className="card dim">No agent_logs rows yet.</div>;

  return (
    <div className="card">
      <table>
        <thead>
          <tr><th>When</th><th>Agent</th><th>Tool</th><th>Status</th><th>Duration</th><th>Error</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="dim">{new Date(r.startedAt).toLocaleString()}</td>
              <td>{r.agent}</td>
              <td>{r.tool}</td>
              <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span></td>
              <td className="dim">{((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000).toFixed(1)}s</td>
              <td className="dim" style={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.error ?? ''}>{r.error ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}