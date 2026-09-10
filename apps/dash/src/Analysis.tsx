import { useEffect, useMemo, useState } from 'react';
import {
  getAnalysis,
  lookupRef,
  saveAnalysis,
  type AdRun,
  type AdRunBody,
  type AnalysisBody,
  type AnalysisPayload,
  type AnalysisVideo,
  type PairedVideoRef,
  type RefEcho,
} from './api.js';

/**
 * X1 — Eknoor inputs content analysis (docs/spec/x-series.md, X1).
 * Platform-agnostic: the platform filter is whatever values arrive in the
 * data. Metrics render only where present — a null is shown as absent, never
 * derived. Form decisions locked 2026-09-10: idea_source chips + free text,
 * format / cta_type dropdowns with Other, paste-ID cross-platform ref with
 * echo, editable upsert, analysed_by from the session.
 *
 * Follow-up locked 2026-09-10: a video can pair with more than one other
 * video at once (its YouTube twin AND its Instagram twin, once X9 lands),
 * ad status is tri-state — Yes / No / Don't know — since ad status is
 * independent per video, and a video can have more than one ad run over its
 * life (re-boosted at different times) — each run has its own dates/spend,
 * with no auto-summed total (that's computed at report time, X5).
 */

const FORMAT_OPTIONS = ['Talking head', 'Skit', 'Screen/text overlay', 'Voiceover B-roll', 'Duet/Stitch', 'Live clip'];
const CTA_OPTIONS = ['Comment', 'Follow', 'Link in bio', 'DM', 'Enrol/Book', 'Save/Share', 'None'];
const OTHER = 'Other';

type AnalysedFilter = 'all' | 'todo' | 'done';
type TriState = 'yes' | 'no' | 'unknown';

interface AdRunDraft {
  key: string;
  startDate: string;
  endDate: string;
  spendDollars: string;
}

function newDraft(): AdRunDraft {
  return { key: Math.random().toString(36).slice(2), startDate: '', endDate: '', spendDollars: '' };
}

function draftsFromRuns(runs: AdRun[]): AdRunDraft[] {
  return runs.map((r) => ({
    key: r.id,
    startDate: r.startDate ?? '',
    endDate: r.endDate ?? '',
    spendDollars: r.spendCents === null ? '' : (r.spendCents / 100).toFixed(2),
  }));
}

interface FormState {
  description: string;
  hookText: string;
  formatChoice: string;
  formatOther: string;
  hasModel: '' | 'yes' | 'no';
  hasCta: '' | 'yes' | 'no';
  ctaChoice: string;
  ctaOther: string;
  adBoosted: TriState;
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
    adBoosted: a?.adBoosted === true ? 'yes' : a?.adBoosted === false ? 'no' : 'unknown',
    ideaSource: a?.ideaSource ?? '',
  };
}

function toBody(f: FormState, refs: PairedVideoRef[], adRunDrafts: AdRunDraft[]): AnalysisBody {
  const nz = (s: string): string | null => (s.trim() === '' ? null : s.trim());
  const format = f.formatChoice === OTHER ? nz(f.formatOther) : nz(f.formatChoice);
  const cta = f.ctaChoice === OTHER ? nz(f.ctaOther) : nz(f.ctaChoice);
  const adBoosted: boolean | null = f.adBoosted === 'yes' ? true : f.adBoosted === 'no' ? false : null;
  const adRuns: AdRunBody[] = adBoosted === true
    ? adRunDrafts
        .filter((d) => d.startDate.trim() !== '' || d.endDate.trim() !== '' || d.spendDollars.trim() !== '')
        .map((d) => {
          const spend = d.spendDollars.trim() === '' ? null : Math.round(Number(d.spendDollars) * 100);
          return {
            startDate: nz(d.startDate),
            endDate: nz(d.endDate),
            spendCents: spend !== null && Number.isFinite(spend) ? spend : null,
          };
        })
    : [];
  return {
    description: nz(f.description),
    hookText: nz(f.hookText),
    format,
    hasModel: f.hasModel === '' ? null : f.hasModel === 'yes',
    hasCta: f.hasCta === '' ? null : f.hasCta === 'yes',
    ctaType: f.hasCta === 'yes' ? cta : null,
    adBoosted,
    adRuns,
    crossPlatformVideoIds: refs.map((r) => r.platformVideoId),
    ideaSource: nz(f.ideaSource),
  };
}

const ERROR_TEXT: Record<string, string> = {
  ref_not_found: 'No video with that ID exists in the data yet.',
  ref_is_self: 'That is this video\u2019s own ID.',
  ref_same_platform: 'The paired video must be on a different platform.',
  ad_end_before_start: 'One of the ad runs has an end date before its start date.',
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
  const [refs, setRefs] = useState<PairedVideoRef[]>(video.crossPlatformRefVideos);
  const [refInput, setRefInput] = useState('');
  const [refPreview, setRefPreview] = useState<RefEcho | null | 'missing'>(null);
  const [adRuns, setAdRuns] = useState<AdRunDraft[]>(() => {
    const drafts = draftsFromRuns(video.adRuns);
    return drafts.length > 0 ? drafts : [];
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    const id = refInput.trim();
    if (id === '') { setRefPreview(null); return; }
    const t = setTimeout(() => {
      lookupRef(id).then((r) => setRefPreview(r ?? 'missing')).catch(() => setRefPreview('missing'));
    }, 400);
    return () => clearTimeout(t);
  }, [refInput]);

  const addRef = () => {
    if (refPreview === null || refPreview === 'missing') return;
    if (refPreview.id === video.id || refPreview.platform === video.platform) return;
    if (refs.some((r) => r.id === refPreview.id)) { setRefInput(''); setRefPreview(null); return; }
    setRefs((prev) => [...prev, { id: refPreview.id, platform: refPreview.platform, platformVideoId: refPreview.platformVideoId, title: refPreview.title }]);
    setRefInput('');
    setRefPreview(null);
  };
  const removeRef = (id: string) => setRefs((prev) => prev.filter((r) => r.id !== id));

  const setAdRun = (key: string, patch: Partial<AdRunDraft>) =>
    setAdRuns((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addAdRun = () => setAdRuns((prev) => [...prev, newDraft()]);
  const removeAdRun = (key: string) => setAdRuns((prev) => prev.filter((r) => r.key !== key));

  const m = video.metrics;
  const metric = (label: string, value: string | null) =>
    value === null ? null : <span key={label} style={{ marginRight: 14 }}><span className="dim">{label}</span> {value}</span>;

  const submit = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const result = await saveAnalysis(video.id, toBody(f, refs, adRuns));
      onSaved({ ...video, analysis: result.analysis, crossPlatformRefVideos: result.refs, adRuns: result.adRuns });
      setRefs(result.refs);
      setAdRuns(draftsFromRuns(result.adRuns));
      setMsg({ text: 'Saved.', ok: true });
    } catch (e) {
      const code = e instanceof Error ? e.message : 'error';
      setMsg({ text: ERROR_TEXT[code] ?? `Could not save: ${code}`, ok: false });
    } finally {
      setSaving(false);
    }
  };

  const refInputStatus =
    refInput.trim() === '' ? ''
      : refPreview === 'missing' ? 'No video with that ID in the data.'
      : refPreview === null ? 'Looking up…'
      : refPreview.id === video.id ? 'That is this video\u2019s own ID.'
      : refPreview.platform === video.platform ? 'That video is on the same platform as this one.'
      : refs.some((r) => r.id === refPreview.id) ? 'Already added.'
      : `→ ${refPreview.platform}: ${refPreview.title ?? '(untitled)'} — press Add`;
  const refInputOk = refInput.trim() !== '' && refPreview !== null && refPreview !== 'missing'
    && refPreview.id !== video.id && refPreview.platform !== video.platform && !refs.some((r) => r.id === refPreview.id);

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

      <Field label="Ad boosted? — check TikTok Ads Manager / Meta Ads Manager for this specific video">
        <div className="chips">
          {(['yes', 'no', 'unknown'] as const).map((v) => (
            <button key={v} type="button" className={`chip ${f.adBoosted === v ? 'active' : ''}`} onClick={() => set('adBoosted', v)}>
              {v === 'yes' ? 'Yes' : v === 'no' ? 'No' : "Don't know"}
            </button>
          ))}
        </div>
        <div className="hint">A video can be boosted on one platform and not on its twin — this only covers {video.platform} for this video. No paid/organic split until X4.</div>
      </Field>
      {f.adBoosted === 'yes' && (
        <div style={{ marginBottom: 14 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>
            Ad runs — one line per campaign (a video can be boosted more than once over its life)
          </div>
          {adRuns.map((r, i) => (
            <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
              <label>
                <span className="hint" style={{ display: 'block', marginBottom: 4 }}>{i === 0 ? 'Start' : ''}</span>
                <input type="date" className="input" value={r.startDate} onChange={(e) => setAdRun(r.key, { startDate: e.target.value })} />
              </label>
              <label>
                <span className="hint" style={{ display: 'block', marginBottom: 4 }}>{i === 0 ? 'End' : ''}</span>
                <input type="date" className="input" value={r.endDate} onChange={(e) => setAdRun(r.key, { endDate: e.target.value })} />
              </label>
              <label>
                <span className="hint" style={{ display: 'block', marginBottom: 4 }}>{i === 0 ? 'Spend ($)' : ''}</span>
                <input type="number" min="0" step="0.01" className="input" placeholder="0.00" value={r.spendDollars} onChange={(e) => setAdRun(r.key, { spendDollars: e.target.value })} />
              </label>
              <button type="button" className="btn ghost" onClick={() => removeAdRun(r.key)} aria-label="Remove run">×</button>
            </div>
          ))}
          <button type="button" className="btn" onClick={addAdRun}>
            {adRuns.length === 0 ? '+ Add ad run' : '+ Add another run'}
          </button>
          <div className="hint" style={{ marginTop: 6 }}>Each row is its own campaign — spend is per run, not totalled here.</div>
        </div>
      )}

      <Field label="Equivalent videos on other platforms — paste each video ID, one per platform (e.g. its YouTube twin and its Instagram twin)">
        {refs.length > 0 && (
          <div className="chips">
            {refs.map((r) => (
              <span key={r.id} className="chip active" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {r.platform}: {r.title ?? '(untitled)'}
                <button type="button" onClick={() => removeRef(r.id)} aria-label="Remove"
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 15, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" style={{ flex: 1 }} value={refInput}
            onChange={(e) => setRefInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRef(); } }}
            placeholder="Platform video ID" />
          <button type="button" className="btn" disabled={!refInputOk} onClick={addRef}>Add</button>
        </div>
        <div className={`hint ${refInput.trim() === '' ? '' : refInputOk ? 'ok' : 'bad'}`}>
          {refInput.trim() === '' ? 'Leave blank if there is no twin yet.' : refInputStatus}
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
