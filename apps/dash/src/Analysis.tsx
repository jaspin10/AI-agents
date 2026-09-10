import { useEffect, useMemo, useState } from 'react';
import {
  getAnalysis,
  lookupRef,
  saveAnalysis,
  type AnalysisBody,
  type AnalysisPayload,
  type AnalysisVideo,
  type RefEcho,
} from './api.js';

/**
 * X1 — Eknoor inputs content analysis (docs/spec/x-series.md, X1).
 * Platform-agnostic: the platform filter is whatever values arrive in the
 * data. Metrics render only where present — a null is shown as absent, never
 * derived. Form decisions locked 2026-09-10: idea_source chips + free text,
 * format / cta_type dropdowns with Other, paste-ID cross-platform ref with
 * echo, editable upsert, analysed_by from the session.
 */

const FORMAT_OPTIONS = ['Talking head', 'Skit', 'Screen/text overlay', 'Voiceover B-roll', 'Duet/Stitch', 'Live clip'];
const CTA_OPTIONS = ['Comment', 'Follow', 'Link in bio', 'DM', 'Enrol/Book', 'Save/Share', 'None'];
const OTHER = 'Other';

type AnalysedFilter = 'all' | 'todo' | 'done';

interface FormState {
  description: string;
  hookText: string;
  formatChoice: string;
  formatOther: string;
  hasModel: '' | 'yes' | 'no';
  hasCta: '' | 'yes' | 'no';
  ctaChoice: string;
  ctaOther: string;
  adBoosted: boolean;
  adStartDate: string;
  adEndDate: string;
  adSpendDollars: string;
  crossPlatformVideoId: string;
  ideaSource: string;
}

function splitChoice(value: string | null, options: string[]): { choice: string; other: string } {
  if (value === null || value === '') return { choice: '', other: '' };
  return options.includes(value) ? { choice: value, other: '' } : { choice: OTHER, other: value };
}

function toForm(v: AnalysisVideo): FormState {
  const a = v.analysis;
  const f = splitChoice(a?.format ?? null, FORMAT_OPTIONS);
  const c = splitChoice(a?.ctaType ?? null, CTA_OPTIONS);
  return {
    description: a?.description ?? '',
    hookText: a?.hookText ?? '',
    formatChoice: f.choice,
    formatOther: f.other,
    hasModel: a?.hasModel === true ? 'yes' : a?.hasModel === false ? 'no' : '',
    hasCta: a?.hasCta === true ? 'yes' : a?.hasCta === false ? 'no' : '',
    ctaChoice: c.choice,
    ctaOther: c.other,
    adBoosted: a?.adBoosted ?? false,
    adStartDate: a?.adStartDate ?? '',
    adEndDate: a?.adEndDate ?? '',
    adSpendDollars: a?.adSpendCents === null || a?.adSpendCents === undefined ? '' : (a.adSpendCents / 100).toFixed(2),
    crossPlatformVideoId: v.crossPlatformRefVideo?.platformVideoId ?? '',
    ideaSource: a?.ideaSource ?? '',
  };
}

function toBody(f: FormState): AnalysisBody {
  const nz = (s: string): string | null => (s.trim() === '' ? null : s.trim());
  const format = f.formatChoice === OTHER ? nz(f.formatOther) : nz(f.formatChoice);
  const cta = f.ctaChoice === OTHER ? nz(f.ctaOther) : nz(f.ctaChoice);
  const spend = f.adSpendDollars.trim() === '' ? null : Math.round(Number(f.adSpendDollars) * 100);
  return {
    description: nz(f.description),
    hookText: nz(f.hookText),
    format,
    hasModel: f.hasModel === '' ? null : f.hasModel === 'yes',
    hasCta: f.hasCta === '' ? null : f.hasCta === 'yes',
    ctaType: f.hasCta === 'yes' ? cta : null,
    adBoosted: f.adBoosted,
    adStartDate: f.adBoosted ? nz(f.adStartDate) : null,
    adEndDate: f.adBoosted ? nz(f.adEndDate) : null,
    adSpendCents: f.adBoosted && spend !== null && Number.isFinite(spend) ? spend : null,
    crossPlatformVideoId: nz(f.crossPlatformVideoId),
    ideaSource: nz(f.ideaSource),
  };
}

const ERROR_TEXT: Record<string, string> = {
  ref_not_found: 'No video with that ID exists in the data yet.',
  ref_is_self: 'That is this video\u2019s own ID.',
  ref_same_platform: 'The paired video must be on a different platform.',
  ad_end_before_start: 'Ad end date is before the start date.',
  invalid_body: 'Something in the form is not valid — check the dates and spend.',
};

export function Analysis() {
  const [data, setData] = useState<AnalysisPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>('all');
  const [analysed, setAnalysed] = useState<AnalysedFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    getAnalysis().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  const platforms = useMemo(() => ['all', ...new Set((data?.videos ?? []).map((v) => v.platform))], [data]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.videos ?? []).filter((v) => {
      if (platform !== 'all' && v.platform !== platform) return false;
      if (analysed === 'done' && v.analysis === null) return false;
      if (analysed === 'todo' && v.analysis !== null) return false;
      if (q !== '' && !(v.title ?? '').toLowerCase().includes(q) && !v.platformVideoId.includes(q)) return false;
      return true;
    });
  }, [data, platform, analysed, search]);

  const selected = useMemo(() => data?.videos.find((v) => v.id === selectedId) ?? null, [data, selectedId]);

  if (error !== null) return <div className="card dim">API error: {error}</div>;
  if (data === null) return <div className="card dim">Loading…</div>;

  const doneCount = data.videos.filter((v) => v.analysis !== null).length;

  const onSaved = (updated: AnalysisVideo) => {
    setData((prev) =>
      prev === null
        ? prev
        : {
            videos: prev.videos.map((v) => (v.id === updated.id ? updated : v)),
            ideaSources:
              updated.analysis?.ideaSource !== null && updated.analysis?.ideaSource !== undefined && !prev.ideaSources.includes(updated.analysis.ideaSource)
                ? [...prev.ideaSources, updated.analysis.ideaSource]
                : prev.ideaSources,
          }
    );
  };

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button key={label} type="button" className={`chip ${active ? 'active' : ''}`} onClick={onClick}>{label}</button>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected === null ? '1fr' : 'minmax(0, 1.1fr) minmax(360px, 0.9fr)', gap: 16, alignItems: 'start' }}>
      <div className="card">
        <div className="chips">
          {platforms.map((p) => chip(p, p === platform, () => setPlatform(p)))}
          <span style={{ width: 10 }} />
          {chip('All', analysed === 'all', () => setAnalysed('all'))}
          {chip('Not yet', analysed === 'todo', () => setAnalysed('todo'))}
          {chip('Analysed', analysed === 'done', () => setAnalysed('done'))}
        </div>
        <div style={{ marginBottom: 12 }}>
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or video ID" />
          <div className="hint">
            {visible.length} shown · {doneCount} of {data.videos.length} analysed · click a row to open its form
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Platform</th>
              <th>Title</th>
              <th>Posted</th>
              <th>Views</th>
              <th>Likes</th>
              <th>Comments</th>
              <th>Shares</th>
              <th>Watch</th>
              <th>Idea</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((v) => {
              const m = v.metrics;
              return (
                <tr key={v.id} onClick={() => setSelectedId(v.id)}
                  style={{ cursor: 'pointer', background: v.id === selectedId ? 'rgba(255,255,255,0.05)' : undefined }}>
                  <td title={v.analysis === null ? 'Not analysed yet' : `Analysed by ${v.analysis.analysedBy}`}>{v.analysis === null ? '○' : '●'}</td>
                  <td>{v.platform}</td>
                  <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.title ?? ''}>{v.title ?? '(untitled)'}</td>
                  <td className="dim">{v.postedAt.slice(0, 10)}</td>
                  <td>{m === null ? '—' : m.views.toLocaleString()}</td>
                  <td>{m === null ? '—' : m.likes.toLocaleString()}</td>
                  <td>{m === null ? '—' : m.comments.toLocaleString()}</td>
                  <td>{m === null ? '—' : m.shares.toLocaleString()}</td>
                  <td>{m === null || m.avgWatchTimeSeconds === null ? '—' : `${m.avgWatchTimeSeconds.toFixed(0)}s`}</td>
                  <td className="dim">{v.analysis?.ideaSource ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selected !== null && (
        <AnalysisForm key={selected.id} video={selected} ideaSources={data.ideaSources}
          onClose={() => setSelectedId(null)} onSaved={onSaved} />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function AnalysisForm({ video, ideaSources, onClose, onSaved }: {
  video: AnalysisVideo;
  ideaSources: string[];
  onClose: () => void;
  onSaved: (v: AnalysisVideo) => void;
}) {
  const [f, setF] = useState<FormState>(() => toForm(video));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [refEcho, setRefEcho] = useState<RefEcho | null | 'missing'>(video.crossPlatformRefVideo === null ? null : { ...video.crossPlatformRefVideo, postedAt: '' });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    const id = f.crossPlatformVideoId.trim();
    if (id === '') { setRefEcho(null); return; }
    if (id === video.crossPlatformRefVideo?.platformVideoId) return;
    const t = setTimeout(() => {
      lookupRef(id).then((r) => setRefEcho(r ?? 'missing')).catch(() => setRefEcho('missing'));
    }, 400);
    return () => clearTimeout(t);
  }, [f.crossPlatformVideoId, video.crossPlatformRefVideo]);

  const m = video.metrics;
  const metric = (label: string, value: string | null) =>
    value === null ? null : <span key={label} style={{ marginRight: 14 }}><span className="dim">{label}</span> {value}</span>;

  const submit = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const result = await saveAnalysis(video.id, toBody(f));
      const refVideo = refEcho !== null && refEcho !== 'missing' && f.crossPlatformVideoId.trim() !== ''
        ? { id: refEcho.id, platform: refEcho.platform, platformVideoId: refEcho.platformVideoId, title: refEcho.title }
        : null;
      onSaved({ ...video, analysis: result.analysis, crossPlatformRefVideo: refVideo });
      setMsg({ text: 'Saved.', ok: true });
    } catch (e) {
      const code = e instanceof Error ? e.message : 'error';
      setMsg({ text: ERROR_TEXT[code] ?? `Could not save: ${code}`, ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ position: 'sticky', top: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={video.title ?? ''}>
            {video.title ?? '(untitled)'}
          </div>
          <div className="hint" style={{ marginTop: 2 }}>{video.platform} · {video.platformVideoId} · posted {video.postedAt.slice(0, 10)}</div>
        </div>
        <button type="button" className="btn ghost" onClick={onClose}>Close</button>
      </div>
      <div style={{ margin: '10px 0 16px', fontSize: 13 }}>
        {m === null ? <span className="dim">No snapshot captured yet.</span> : [
          metric('Views', m.views.toLocaleString()),
          metric('Likes', m.likes.toLocaleString()),
          metric('Comments', m.comments.toLocaleString()),
          metric('Shares', m.shares.toLocaleString()),
          metric('Saves', m.saves === null ? null : m.saves.toLocaleString()),
          metric('Avg watch', m.avgWatchTimeSeconds === null ? null : `${m.avgWatchTimeSeconds.toFixed(1)}s`),
          metric('Retention', m.retentionPct === null ? null : `${m.retentionPct.toFixed(1)}%`),
          metric('as of', m.capturedDate),
        ]}
      </div>
      {video.analysis !== null && (
        <div className="hint" style={{ marginBottom: 12 }}>
          Last saved by {video.analysis.analysedBy} on {video.analysis.analysedAt.slice(0, 16).replace('T', ' ')} UTC — edit and save again to update.
        </div>
      )}

      <Field label="Idea source — who had the idea (not who filmed/edited/posted)">
        <div className="chips">
          {ideaSources.map((s) => (
            <button key={s} type="button" className={`chip ${f.ideaSource === s ? 'active' : ''}`}
              onClick={() => set('ideaSource', f.ideaSource === s ? '' : s)}>{s}</button>
          ))}
        </div>
        <input className="input" value={f.ideaSource} onChange={(e) => set('ideaSource', e.target.value)} placeholder="Or type a new name" />
      </Field>

      <Field label="Description">
        <textarea className="textarea" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="What the video is, in a few sentences" />
      </Field>
      <Field label="Hook text (first line / on-screen opener)">
        <input className="input" value={f.hookText} onChange={(e) => set('hookText', e.target.value)} />
      </Field>

      <Field label="Format">
        <select className="select" value={f.formatChoice} onChange={(e) => set('formatChoice', e.target.value)}>
          <option value="">Choose…</option>
          {FORMAT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value={OTHER}>{OTHER}</option>
        </select>
        {f.formatChoice === OTHER && <input className="input" style={{ marginTop: 6 }} value={f.formatOther} onChange={(e) => set('formatOther', e.target.value)} placeholder="Describe the format" />}
      </Field>

      <div className="row2">
        <Field label="Model on camera?">
          <select className="select" value={f.hasModel} onChange={(e) => set('hasModel', e.target.value as FormState['hasModel'])}>
            <option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option>
          </select>
        </Field>
        <Field label="Has a CTA?">
          <select className="select" value={f.hasCta} onChange={(e) => set('hasCta', e.target.value as FormState['hasCta'])}>
            <option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option>
          </select>
        </Field>
      </div>

      {f.hasCta === 'yes' && (
        <Field label="CTA type — what the video asks the viewer to do">
          <select className="select" value={f.ctaChoice} onChange={(e) => set('ctaChoice', e.target.value)}>
            <option value="">Choose…</option>
            {CTA_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            <option value={OTHER}>{OTHER}</option>
          </select>
          {f.ctaChoice === OTHER && <input className="input" style={{ marginTop: 6 }} value={f.ctaOther} onChange={(e) => set('ctaOther', e.target.value)} placeholder="Describe the CTA" />}
        </Field>
      )}

      <label className="check">
        <input type="checkbox" checked={f.adBoosted} onChange={(e) => set('adBoosted', e.target.checked)} />
        <span className="check-box" aria-hidden="true">
          <svg viewBox="0 0 12 12"><path d="M2 6.5l2.6 2.5L10 3.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span>Ad boosted <span className="dim">(manual entry — no paid/organic split until X4)</span></span>
      </label>
      {f.adBoosted && (
        <div className="row3">
          <Field label="Ad start"><input type="date" className="input" value={f.adStartDate} onChange={(e) => set('adStartDate', e.target.value)} /></Field>
          <Field label="Ad end"><input type="date" className="input" value={f.adEndDate} onChange={(e) => set('adEndDate', e.target.value)} /></Field>
          <Field label="Spend ($)"><input type="number" min="0" step="0.01" className="input" value={f.adSpendDollars} onChange={(e) => set('adSpendDollars', e.target.value)} placeholder="0.00" /></Field>
        </div>
      )}

      <Field label="Paired video on another platform — paste its video ID">
        <input className="input" value={f.crossPlatformVideoId} onChange={(e) => set('crossPlatformVideoId', e.target.value)} placeholder="Platform video ID" />
        <div className={`hint ${f.crossPlatformVideoId.trim() === '' ? '' : refEcho === 'missing' ? 'bad' : refEcho === null ? '' : 'ok'}`}>
          {f.crossPlatformVideoId.trim() === '' ? 'Leave blank if there is no twin.'
            : refEcho === 'missing' ? 'No video with that ID in the data.'
            : refEcho === null ? 'Looking up…'
            : `→ ${refEcho.platform}: ${refEcho.title ?? '(untitled)'}`}
        </div>
      </Field>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="button" className="btn primary" disabled={saving} onClick={() => void submit()}>
          {saving ? 'Saving…' : video.analysis === null ? 'Save analysis' : 'Save changes'}
        </button>
        {msg !== null && <span className={`hint ${msg.ok ? 'ok' : 'bad'}`} style={{ marginTop: 0 }}>{msg.text}</span>}
      </div>
    </div>
  );
}
