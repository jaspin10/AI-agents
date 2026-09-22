import { useState } from 'react';
import { ageDays } from '@platform/shared/browser';
import { BrainLink, BrainLoading, BrainSourceNotice, EvidenceBadge, useBrain, date, percent } from './brain-ui.js';
export function Learnings() {
  const {data,error,refresh}=useBrain();
  const [platform,setPlatform]=useState(new URLSearchParams(window.location.search).get('filter')??'all'),[limit,setLimit]=useState(12);
  if(!data)return <BrainLoading error={error} retry={refresh}/>;
  const platforms=[...new Set((data.learnings??[]).map(p=>p.platform))].sort();
  const patterns=(data.learnings??[]).filter(p=>platform==='all'||p.platform===platform);
  const stale=data.insight&&ageDays(data.insight.createdAt,data.generatedAt.slice(0,10))>7;
  return <><BrainSourceNotice data={data}/>
    <div className="learning-intro"><div><span className="eyebrow">OUR OWN HISTORY</span><h2>Evidence you can come back to.</h2><p>Patterns describe past results. Creative memory records what people actually reviewed. Both can inform the next brief.</p></div><BrainLink className="btn" to={{view:'insights'}}>Open the full report ↗</BrainLink></div>
    {stale&&<div className="notice warning">The latest report is more than seven days old. Review its date before using it as current guidance.</div>}
    {data.insight&&<details className="card"><summary>Source report · {date(data.insight.createdAt)} · standing cautions</summary>{data.insight.caution.map(s=><p key={s}>{s}</p>)}<p>Cross-platform twins do not control audience, timing, distribution or metric definitions. The reporting minimum is not a confidence estimate.</p></details>}
    <div className="section-heading"><h2>Stored patterns <span className="count-badge">{data.learnings?.length??'—'}</span></h2><p className="dim">Every card points to the videos in its saved X6 evidence. No generic marketing advice.</p></div>
    <div className="chips"><button className={'chip '+(platform==='all'?'active':'')} aria-pressed={platform==='all'} onClick={()=>setPlatform('all')}>All platforms, separate patterns</button>{platforms.map(p=><button className={'chip '+(p===platform?'active':'')} aria-pressed={p===platform} key={p} onClick={()=>{setPlatform(p);setLimit(12);}}>{p}</button>)}</div>
    <div className="learning-grid">{patterns.slice(0,limit).map(p=><article className="card learning-card" key={p.platform+p.dimension+p.value}><div className="panel-heading"><EvidenceBadge level="pattern"/><span className="subtle-label">{p.platform}</span></div>
      <h3>{p.value}</h3><p>{p.dimension.replaceAll('_',' ')} · {p.direction==='works'?'Higher recorded engagement':p.direction==='doesnt'?'Lower recorded engagement':'No material relative difference'}</p>
      <div className="learning-stat"><strong>{percent(p.medianEngagementPct)}</strong><span>group median<br/>vs {percent(p.platformMedianPct)} platform median</span><b>n={p.n}</b></div>
      <p className="hint">{p.evidence.adBoostedCount} boosted · {p.evidence.adUnknownCount} unknown ad status. Pooled observations, not proof.</p>
      <details><summary>Why are we saying this?</summary><p>Source report {p.runId.slice(0,8)} · {date(p.recordedAt)}. The existing X6 report recorded these videos as contributing evidence.</p><ul className="evidence-links">{p.evidence.videoIds.map(id=><li key={id}><BrainLink to={{view:'performance',id}}>{data.videos?.find(v=>v.id===id)?.title??id}</BrainLink></li>)}</ul><p>Counterexamples and contradicting experiments are not enumerated by this report. A formal experiment register is not built yet; no absence of contradiction is claimed.</p></details>
      <div className="learning-next"><strong>{p.direction==='works'?'Next: repeat and verify':p.direction==='doesnt'?'Next: test an alternative':'Next: collect a clearer comparison'}</strong><p>Keep the platform, learner and lesson comparable; change one element. Do not generalize from this group to every video.</p>{p.evidence.videoIds[0]&&<BrainLink to={{view:'briefs',example:p.evidence.videoIds[0]}} className="text-action">Use an example in a new brief ↗</BrainLink>}</div>
    </article>)}</div>
    {!patterns.length&&<div className="card empty-state"><strong>No qualifying stored patterns in this view</strong><p>Groups need eight scored videos. Keep adding accurate notes and collecting performance; do not turn a single result into a rule.</p><BrainLink to={{view:'analysis',filter:'todo'}}>Add video context ↗</BrainLink></div>}
    {patterns.length>limit&&<button className="btn load-more" onClick={()=>setLimit(n=>n+12)}>Show more patterns</button>}
    <div className="section-heading"><h2>Creative memory <span className="count-badge">{data.memories?.length??'—'}</span></h2><p className="dim">Versioned human observations of our videos. Reviewed notes can be used as examples in future briefs.</p></div>
    <div className="memory-grid">{(data.memories??[]).slice(0,24).map(m=><article className="card memory-card" key={m.id}><span className="eyebrow">HUMAN NOTES / V{m.version}</span><h3>{m.topic||m.title}</h3><p>{m.title}</p><div className="chips"><span className="badge">{m.reviewed} reviewed observations</span>{m.draft>0&&<span className="badge amber">{m.draft} need review</span>}</div><p className="hint">Updated {date(m.updatedAt)} · asset {m.assetVersion??'not recorded'}</p><div className="diagnosis-actions"><BrainLink to={{view:'analysis',id:m.id}} className="text-action">Open notes & history ↗</BrainLink><BrainLink to={{view:'performance',id:m.id}} className="text-action">See the outcome ↗</BrainLink></div></article>)}</div>
    {!data.memories?.length&&<div className="card empty-state"><strong>No creative memory records yet</strong><p>Open a video in Content notes to record the learner, opening, lesson and reviewed observations.</p><BrainLink to={{view:'analysis'}}>Open Content notes ↗</BrainLink></div>}
    {(data.memories?.length??0)>24&&<p className="hint">Showing 24 of {data.memories!.length} loaded memory records. Every video remains accessible through Content notes.</p>}
    <div className="notice"><strong>Durable evidence, with clear limits.</strong> Reports and manual note revisions already persist. Promoting, contradicting or retiring formal learning rules belongs to the future experiment/playbook workflow; this view does not pretend those decisions have happened.</div>
  </>;
}
