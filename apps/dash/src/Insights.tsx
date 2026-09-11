import { useEffect, useMemo, useState } from 'react';
import { decideTag, getInsights, runInsights, type HypothesisProposal, type InsightClaim, type InsightsPayload } from './api.js';

/**
 * X6 — insights (docs/spec/x-series.md, X6). Renders whatever the last run of
 * the insights agent stored. Rules this panel keeps:
 *   - one section per platform, never a blended figure (platform list from data)
 *   - every claim shows its evidence (n, medians, boosted/unknown counts, the videos)
 *   - pair evidence is drawn above pooled claims and labelled stronger
 *   - the standing caution comes from the payload and is always on screen
 *   - hypothesis tags are proposals until Approve is clicked here (suggest-only)
 */

const DIM_LABEL: Record<InsightClaim['dimension'], string> = {
  format: 'Format',
  idea_source: 'Idea source',
  cta_type: 'CTA',
  has_model: 'Has model',
  hypothesis: 'Hypothesis tag',
};

const pct = (v: number | null): string => (v === null ? 'n/a' : `${v.toFixed(2)}%`);

export function Insights() {
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openClaim, setOpenClaim] = useState<string | null>(null);
  const [showDecided, setShowDecided] = useState(false);

  const load = () => getInsights().then(setData).catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  const pending = useMemo(() => (data?.proposals ?? []).filter((p) => p.status === 'suggested'), [data]);
  const decided = useMemo(() => (data?.proposals ?? []).filter((p) => p.status !== 'suggested'), [data]);

  async function onRun() {
    setBusy(true);
    setError(null);
    try {
      await runInsights();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDecide(p: HypothesisProposal, status: 'approved' | 'rejected') {
    try {
      await decideTag(p.id, status);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (error !== null && data === null) return <div className="card dim">API error: {error}</div>;
  if (data === null) return <div className="card dim">Loading…</div>;

  const run = data.run;
  const r = run?.report ?? null;
  const videoLabel = (id: string): string => {
    const v = data.videos[id];
    return v === undefined ? id : `[${v.platform}] ${v.title ?? v.platformVideoId}`;
  };

  return (
    <div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={onRun} disabled={busy || data.running}>
          {busy || data.running ? 'Running…' : 'Run insights now'}
        </button>
        <span className="dim" style={{ fontSize: 12 }}>
          {run === null
            ? 'No run yet. Runs nightly after the sync, or press the button.'
            : `Last run ${run.createdAt.slice(0, 16).replace('T', ' ')} UTC · ${run.trigger} by ${run.triggeredBy} · ${run.analysedCount}/${run.videoCount} analysed`}
          {r !== null && r.llm.status === 'skipped' ? <span className="badge amber" style={{ marginLeft: 8 }}>numbers only — {r.llm.reason}</span> : null}
        </span>
        {error !== null ? <span className="hint bad">{error}</span> : null}
      </div>

      {r === null ? null : (
        <>
          <div className="card" style={{ borderColor: 'var(--amber)' }}>
            <div className="dim" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Caution — read first</div>
            {r.caution.map((line) => (
              <div key={line} style={{ marginBottom: 4 }}>• {line}</div>
            ))}
            <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>{r.method}</div>
          </div>

          {r.narrative !== null ? <div className="card">{r.narrative.overall}</div> : null}

          {r.pairs.length > 0 ? (
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Cross-platform pairs <span className="badge green">stronger evidence</span>
              </div>
              <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>Same video on two platforms — hook, format and idea source held constant, platform the only thing that varies.</div>
              {r.pairs.map((p, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  {p.sides.map((s) => `${s.platform} ${pct(s.engagementRatePct)}`).join(' vs ')} → <strong>{p.winner ?? 'no winner'}</strong>
                  {p.adConfounded ? <span className="badge amber" style={{ marginLeft: 6 }}>ad-confounded</span> : null}
                  <div className="dim" style={{ fontSize: 12 }}>{p.sides[0]?.title ?? ''} · format {p.heldConstant.format ?? '—'} · idea {p.heldConstant.ideaSource ?? '—'}</div>
                </div>
              ))}
            </div>
          ) : null}

          {r.perPlatform.map((p) => {
            const summary = r.narrative?.perPlatform.find((n) => n.platform === p.platform)?.summary;
            return (
              <div className="card" key={p.platform}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {p.platform}{' '}
                  <span className="dim" style={{ fontWeight: 400, fontSize: 12 }}>
                    {p.analysedVideos} analysed · {p.scoredVideos} scored{p.platformMedianPct === null ? '' : ` · median engagement ${pct(p.platformMedianPct)}`}
                  </span>
                </div>
                {!p.enoughData ? (
                  <div className="dim">Not enough scored videos yet to say what works on {p.platform} (need 8, have {p.scoredVideos}).</div>
                ) : (
                  <>
                    {summary !== undefined ? <div style={{ marginBottom: 10 }}>{summary}</div> : null}
                    {p.claims.length === 0 ? <div className="dim">No group reached 8 scored videos.</div> : null}
                    {p.claims.map((c) => {
                      const key = `${c.platform}|${c.dimension}|${c.value}`;
                      const open = openClaim === key;
                      return (
                        <div key={key} style={{ marginBottom: 8 }}>
                          <button className="btn ghost" onClick={() => setOpenClaim(open ? null : key)} style={{ padding: '2px 6px' }}>
                            {c.direction === 'works' ? <span className="badge green">works</span> : c.direction === 'doesnt' ? <span className="badge red">doesn't</span> : <span className="badge">neutral</span>}{' '}
                            {DIM_LABEL[c.dimension]}: <strong>{c.value}</strong> — {pct(c.medianEngagementPct)} vs {pct(c.platformMedianPct)} ({c.relativeDelta >= 0 ? '+' : ''}{Math.round(c.relativeDelta * 100)}%, n={c.n}, pooled)
                          </button>
                          {open ? (
                            <div className="dim" style={{ fontSize: 12, paddingLeft: 10 }}>
                              Evidence: {c.n} videos · {c.evidence.adBoostedCount} boosted · {c.evidence.adUnknownCount} ad status unknown · pooled across unrelated videos (weaker than a pair)
                              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                {c.evidence.videoIds.map((id) => (
                                  <li key={id}>{videoLabel(id)}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {p.skipped.length > 0 ? (
                      <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>
                        Not enough videos to say: {p.skipped.map((s) => `${DIM_LABEL[s.dimension as InsightClaim['dimension']] ?? s.dimension}=${s.value} (${s.n})`).join(' · ')}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Hypothesis tag proposals <span className="badge amber">suggest-only</span></div>
            <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
              Proposed from Eknoor's descriptions. Nothing is written to a video until you approve it here.
            </div>
            {pending.length === 0 ? <div className="dim">No pending proposals.</div> : null}
            {pending.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                <span className="chip">{p.tag}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>{videoLabel(p.contentId)}</div>
                  <div className="dim" style={{ fontSize: 12 }}>{p.rationale ?? ''}</div>
                </div>
                <button className="btn primary" onClick={() => onDecide(p, 'approved')}>Approve</button>
                <button className="btn" onClick={() => onDecide(p, 'rejected')}>Reject</button>
              </div>
            ))}
            {decided.length > 0 ? (
              <button className="btn ghost" onClick={() => setShowDecided(!showDecided)} style={{ marginTop: 4 }}>
                {showDecided ? 'Hide' : 'Show'} {decided.length} decided
              </button>
            ) : null}
            {showDecided
              ? decided.map((p) => (
                  <div key={p.id} className="dim" style={{ fontSize: 12 }}>
                    {p.status === 'approved' ? '✓' : '✗'} {p.tag} — {videoLabel(p.contentId)} ({p.decidedBy ?? ''})
                  </div>
                ))
              : null}
          </div>
        </>
      )}
    </div>
  );
}
