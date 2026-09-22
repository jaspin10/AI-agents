import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { brainHref, type BrainOverview, type BrainTarget } from '@platform/shared/browser';
import { getJson } from './api.js';

export const BrainNavigation = createContext<(url: string) => void>(() => {});
export function BrainLink({ to, children, className = '', ...props }: { to: BrainTarget; children: ReactNode; className?: string; title?: string; 'aria-current'?: 'page' }) {
  const navigate = useContext(BrainNavigation), href = brainHref(to);
  return <a {...props} className={className} href={href} onClick={e => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); navigate(href);
  }}>{children}</a>;
}
let cache: { at: number; data: BrainOverview } | null = null;
let pending: Promise<BrainOverview> | null = null;
let generation = 0;
function invalidate() { cache = null; generation++; }
window.addEventListener('marketing:data-changed', invalidate);
function loadBrain(force: boolean): Promise<BrainOverview> {
  if (force) invalidate();
  if (cache && Date.now() - cache.at < 30000) return Promise.resolve(cache.data);
  if (pending) return pending;
  const started = generation;
  pending = getJson<BrainOverview>('/api/brain').then(data => {
    pending = null;
    // A write may complete during this read. Fetch again instead of showing pre-write state.
    if (started !== generation) return loadBrain(false);
    cache = { at: Date.now(), data };
    return data;
  }, error => { pending = null; throw error; });
  return pending;
}
export function useBrain() {
  const [data, setData] = useState<BrainOverview | null>(null), [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    loadBrain(attempt > 0).then(d => { if (active) { setData(d); setError(null); } }).catch(e => { if (active) setError(String(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    const changed = () => setAttempt(n => n + 1);
    window.addEventListener('marketing:data-changed', changed);
    return () => window.removeEventListener('marketing:data-changed', changed);
  }, []);
  return { data, error, loading, refresh: () => setAttempt(n => n + 1) };
}
export function BrainLoading({ error, retry }: { error: string | null; retry: () => void }) {
  return <div className="card empty-state" role={error ? 'alert' : 'status'}><strong>{error ? 'Unable to read the marketing brain' : 'Reading your marketing workspace…'}</strong><p>{error ?? 'Bringing the saved evidence and workflow states together.'}</p>{error && <button className="btn" onClick={retry}>Try again</button>}</div>;
}
export function BrainSourceNotice({ data }: { data: BrainOverview }) {
  return data.sourceErrors.length ? <div className="notice warning" role="status"><strong>Some sources are unavailable.</strong> {data.sourceErrors.join(', ')}. Missing sources are not counted as zero. Other tools remain available.</div> : null;
}
export function EvidenceBadge({ level }: { level: 'observed' | 'pattern' | 'hypothesis' | 'unknown' | 'confirmed' | 'inferred' }) {
  const labels = { observed: 'Observed record', pattern: 'Supported pattern', hypothesis: 'Hypothesis', unknown: 'Unknown', confirmed: 'Confirmed', inferred: 'Inferred' };
  return <span className={'evidence-badge evidence-' + level}>{labels[level]}</span>;
}
export const number = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString();
export const percent = (value: number | null | undefined) => value == null ? 'n/a' : value.toFixed(2) + '%';
export const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString(undefined, {month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}) : 'Not recorded';
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    brain: <><circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="m7 7 3 3m4 4 3 3M7 17l3-3m4-4 3-3"/></>,
    audience: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 4v2"/></>,
    creative: <><path d="m4 16 12-12 4 4L8 20H4v-4Zm10-10 4 4M4 4h5M4 8h2"/></>,
    production: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10M15 10v10"/></>,
    results: <><path d="M4 4v16h16M8 15l4-5 4 2 4-7"/><path d="M16 5h4v4"/></>,
    learning: <><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/></>,
    strategy: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 12 8-8M17 4h3v3"/></>,
    system: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.brain}</svg>;
}
