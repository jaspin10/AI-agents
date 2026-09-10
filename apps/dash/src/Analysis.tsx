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
    <button key={label} className={`nav-item ${active ? 'active' : ''}`}
      style={{ display: 'inline-block', width: 'auto', marginRight: 6, marginBottom: 6 }} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected === null ? '1fr' : 'minmax(0, 1.1fr) minmax(360px, 0.9fr)', gap: 16, alignItems: 'start' }}>
      <div className="card">
        <div style={{ marginBottom: 8 }}>
          {platforms.map((p) => chip(p, p === platform, () => setPlatform(p)))}
          <span style={{ display: 'inline-block', width: 14 }} />
          {chip('All', analysed === 'all', () => setAnalysed('all'))}
          {chip('Not yet', analysed === 'todo', () => setAnalysed('todo'))}
          {chip('Analysed', analysed === 'done', () => setAnalysed('done'))}
        </div>
        <div style={{ marginBottom: 12 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or video ID"
            style={{ width: '100%', boxSizing: 'border-box' }} />
          <div className="dim" style={{ marginTop: 6, fontSize: 12 }}>
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

function AnalysisForm({ video, ideaSources, onClose, onSaved }: {
  video: AnalysisVideo;
  ideaSources: string[];
  onClose: () => void;
  onSaved: (v: AnalysisVideo) => void;
}) {
  const [f, setF] = useState<FormState>(() => toForm(video));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
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
      setMsg('Saved.');
    } catch (e) {
      const code = e instanceof Error ? e.message : 'error';
      setMsg(ERROR_TEXT[code] ?? `Could not save: ${code}`);
    } finally {
      setSaving(false);
    }
  };

  const row = (label: string, control: JSX.Element) => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div className="dim" style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      {control}
    </label>
  );
  const full = { width: '100%', boxSizing: 'border-box' as const };

  return (
    <div className="card" style={{ position: 'sticky', top: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 600 }}>{video.title ?? '(untitled)'}</div>
          <div className="dim" style={{ fontSize: 12 }}>{video.platform} · {video.platformVideoId} · posted {video.postedAt.slice(0, 10)}</div>
        </div>
        <button className="nav-item" style={{ width: 'auto' }} onClick={onClose}>Close</button>
      </div>
      <div style={{ margin: '10px 0 14px', fontSize: 13 }}>
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
        <div className="dim" style={{ fontSize: 12, marginBottom: 10 }}>
          Last saved by {video.analysis.analysedBy} on {video.analysis.analysedAt.slice(0, 16).replace('T', ' ')} UTC — edit and save again to update.
        </div>
      )}

      {row('Idea source — who had the idea (not who filmed/edited/posted)', (
        <div>
          <div style={{ marginBottom: 6 }}>
            {ideaSources.map((s) => (
              <button key={s} className={`nav-item ${f.ideaSource === s ? 'active' : ''}`}
                style={{ display: 'inline-block', width: 'auto', marginRight: 6, marginBottom: 6 }}
                onClick={(e) => { e.preventDefault(); set('ideaSource', s); }}>{s}</button>
            ))}
          </div>
          <input style={full} value={f.ideaSource} onChange={(e) => set('ideaSource', e.target.value)} placeholder="Or type a new name" />
        </div>
      ))}

      {row('Description', <textarea style={{ ...full, minHeight: 80 }} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="What the video is, in a few sentences" />)}
      {row('Hook text (first line / on-screen opener)', <input style={full} value={f.hookText} onChange={(e) => set('hookText', e.target.value)} />)}

      {row('Format', (
        <div>
          <select style={full} value={f.formatChoice} onChange={(e) => set('formatChoice', e.target.value)}>
            <option value="">—</option>
            {FORMAT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            <option value={OTHER}>{OTHER}</option>
          </select>
          {f.formatChoice === OTHER && <input style={{ ...full, marginTop: 6 }} value={f.formatOther} onChange={(e) => set('formatOther', e.target.value)} placeholder="Describe the format" />}
        </div>
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {row('Model on camera?', (
          <select style={full} value={f.hasModel} onChange={(e) => set('hasModel', e.target.value as FormState['hasModel'])}>
            <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
          </select>
        ))}
        {row('Has a CTA?', (
          <select style={full} value={f.hasCta} onChange={(e) => set('hasCta', e.target.value as FormState['hasCta'])}>
            <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
          </select>
        ))}
      </div>

      {f.hasCta === 'yes' && row('CTA type — what the video asks the viewer to do', (
        <div>
          <select style={full} value={f.ctaChoice} onChange={(e) => set('ctaChoice', e.target.value)}>
            <option value="">—</option>
            {CTA_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            <option value={OTHER}>{OTHER}</option>
          </select>
          {f.ctaChoice === OTHER && <input style={{ ...full, marginTop: 6 }} value={f.ctaOther} onChange={(e) => set('ctaOther', e.target.value)} placeholder="Describe the CTA" />}
        </div>
      ))}

      <label style={{ display: 'block', marginBottom: 12 }}>
        <input type="checkbox" checked={f.adBoosted} onChange={(e) => set('adBoosted', e.target.checked)} /> Ad boosted (manual entry — no paid/organic split until X4)
      </label>
      {f.adBoosted && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {row('Ad start', <input type="date" style={full} value={f.adStartDate} onChange={(e) => set('adStartDate', e.target.value)} />)}
          {row('Ad end', <input type="date" style={full} value={f.adEndDate} onChange={(e) => set('adEndDate', e.target.value)} />)}
          {row('Spend ($)', <input type="number" min="0" step="0.01" style={full} value={f.adSpendDollars} onChange={(e) => set('adSpendDollars', e.target.value)} />)}
        </div>
      )}

      {row('Paired video on another platform — paste its video ID', (
        <div>
          <input style={full} value={f.crossPlatformVideoId} onChange={(e) => set('crossPlatformVideoId', e.target.value)} placeholder="Platform video ID" />
          <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
            {f.crossPlatformVideoId.trim() === '' ? 'Leave blank if there is no twin.'
              : refEcho === 'missing' ? 'No video with that ID in the data.'
              : refEcho === null ? 'Looking up…'
              : `→ ${refEcho.platform}: ${refEcho.title ?? '(untitled)'}`}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="nav-item active" style={{ width: 'auto' }} disabled={saving} onClick={() => void submit()}>
          {saving ? 'Saving…' : video.analysis === null ? 'Save analysis' : 'Save changes'}
        </button>
        {msg !== null && <span className="dim" style={{ fontSize: 13 }}>{msg}</span>}
      </div>
    </div>
  );
}
