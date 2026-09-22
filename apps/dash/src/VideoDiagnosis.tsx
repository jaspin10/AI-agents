import { useEffect, useState } from 'react';
import { BRAIN_OUTCOME_LABELS, brainMetricValue, type BrainOverview, type BrainVideo } from '@platform/shared/browser';
import { BrainLink, BrainLoading, EvidenceBadge, number, percent, date } from './brain-ui.js';
import { getJson } from './api.js';
import { ContentJourney } from './ContentJourney.js';
export function VideoDetails({id,data}:{id:string;data:BrainOverview}) {
  const [video,setVideo]=useState<BrainVideo|null>(null),[error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;setVideo(null);setError(null);getJson<BrainVideo>('/api/brain/video/'+id).then(v=>{if(active)setVideo(v);}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[id,attempt]);
  return video?<VideoDiagnosis video={video} data={data}/>:<BrainLoading error={error} retry={()=>setAttempt(n=>n+1)}/>;
}
export function VideoDiagnosis({video:v,data}:{video:BrainVideo;data:BrainOverview}) {
  const c=v.comparison,patterns=(data.learnings??[]).filter(p=>p.platform===v.platform&&p.evidence.videoIds.includes(v.id));
  const hasComparison=c.relativeDelta!==null;
  const max=Math.max(c.targetRate??0,c.medianRate??0,1);
  return <article className="diagnosis">
    <header className="card diagnosis-hero"><div className="panel-heading"><span className="eyebrow">{v.platform} / PUBLISHED {date(v.postedAt)}</span><span className={'outcome-pill outcome-'+v.outcome}>{BRAIN_OUTCOME_LABELS[v.outcome]}</span></div><h2>{v.title??'Untitled video'}</h2><p>{hasComparison?'At day '+c.day+', recorded engagement was '+(v.outcome==='above'?'above':v.outcome==='below'?'below':'near')+' the comparable peer median. The cause is not established.':c.reason}</p>
      <div className="diagnosis-actions"><BrainLink className="btn" to={{view:'analysis',id:v.id}}>Review content notes</BrainLink><BrainLink className="btn" to={{view:'metrics',id:v.id}}>Inspect snapshots & twins</BrainLink><BrainLink className="btn primary" to={{view:'briefs',example:v.id}}>Plan the next test ↗</BrainLink></div>
    </header>
    <section className="card"><div className="panel-heading"><div><span className="eyebrow">01 / WHAT HAPPENED?</span><h3>The recorded outcome</h3></div><EvidenceBadge level="observed"/></div>
      <div className="metric-strip">{[['Views',number(brainMetricValue(v,'views'))],['Engagement',percent(v.rates?.engagementRatePct)],['Comment rate',percent(v.rates?.commentRatePct)],['Share rate',percent(v.rates?.shareRatePct)],['Average watch',brainMetricValue(v,'avgWatchTimeSeconds')==null?'n/a':brainMetricValue(v,'avgWatchTimeSeconds')!.toFixed(1)+'s']].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <p className="hint">Latest snapshot {date(v.capturedDate)} · {v.snapshotCount} saved observations. Recorded values are not a guarantee of verified native definitions.{v.stale?' This snapshot needs a freshness check.':''}</p>
      <details><summary>Metric provenance and availability</summary><div className="table-scroll" role="region" aria-label="Metric provenance" tabIndex={0}><table><thead><tr><th>Metric</th><th>Availability</th><th>Source / definition</th><th>Denominator</th></tr></thead><tbody>{['views','likes','comments','shares','saves','avgWatchTimeSeconds','retentionPct'].map(k=><tr key={k}><td>{k}</td><td>{v.provenance?.[k]?.availability??'Legacy · unverified'}</td><td>{v.provenance?.[k]?.source??'Native endpoint not recorded'} · {v.provenance?.[k]?.definitionVersion??'unknown'}</td><td>{v.provenance?.[k]?.denominator??'Not recorded'}</td></tr>)}</tbody></table></div></details>
    </section>
    <div className="brain-two diagnosis-evidence">
      <section className="card"><div className="panel-heading"><div><span className="eyebrow">02 / WHAT THE DATA SUPPORTS</span><h3>{hasComparison?'A comparable engagement signal':'The comparison is incomplete'}</h3></div><EvidenceBadge level={hasComparison?'observed':'unknown'}/></div>
        {hasComparison?<div className="comparison-bars"><div><span>This video · day {c.day}</span><strong>{percent(c.targetRate)}</strong><i style={{width:Math.max(1,(c.targetRate??0)/max*100)+'%'}}/></div><div className="baseline-bar"><span>Peer median · {c.n} other videos</span><strong>{percent(c.medianRate)}</strong><i style={{width:Math.max(1,(c.medianRate??0)/max*100)+'%'}}/></div></div>:<p>{c.reason}</p>}
        {hasComparison&&<p className="hint">Target observation: {date(c.capturedDate)}. Above/below uses the existing ±20% relative call-out convention, applied only to this labelled comparison.</p>}
        <details><summary>Why these videos are comparable · {c.n} peers</summary><p>{c.scope}</p><p>{c.reason}</p><ul className="evidence-links">{c.peers.map(p=><li key={p.id}><BrainLink to={{view:'performance',id:p.id}}>{p.title??p.id}</BrainLink><span>{percent(p.rate)} · {date(p.capturedDate)}</span></li>)}</ul>{c.n>c.peers.length&&<p>Showing {c.peers.length} of {c.n} peers. The median uses every qualifying peer.</p>}</details>
        <div className="diagnosis-cautions">{v.cautions.map(s=><p key={s}>{s}</p>)}</div>
      </section>
      <section className="card"><div className="panel-heading"><div><span className="eyebrow">HISTORICAL CONTEXT</span><h3>Patterns this video contributed to</h3></div></div>
        {patterns.length?patterns.slice(0,4).map(p=><div className="pattern-snippet" key={p.dimension+p.value}><EvidenceBadge level="pattern"/><strong>{p.dimension.replaceAll('_',' ')}: {p.value}</strong><p>{percent(p.medianEngagementPct)} group median vs {percent(p.platformMedianPct)} platform median · n={p.n}</p><small>Stored {date(p.recordedAt)} · pooled observations; not this video's causal explanation.</small></div>):<p className="quiet-empty">No stored qualifying pattern names this video as evidence. Matching a tag alone does not create evidence.</p>}
        <BrainLink to={{view:'learnings',filter:v.platform}} className="text-action">Inspect the learning evidence ↗</BrainLink>
      </section>
    </div>
    <div className="brain-two">
      <section className="card"><div className="panel-heading"><div><span className="eyebrow">03 / POSSIBLE CAUSES</span><h3>Questions to test</h3></div><EvidenceBadge level="hypothesis"/></div>
        {v.possibleCauses.length?v.possibleCauses.map(h=><div className="hypothesis-block" key={h.category}><h4>{h.category}</h4><p>{h.hypothesis}</p><blockquote>{h.evidence}</blockquote></div>):<p>No documented hook or CTA supports a specific creative hypothesis yet. Add reviewed content notes first.</p>}
      </section>
      <section className="card"><div className="panel-heading"><div><span className="eyebrow">04 / WHAT WE DO NOT KNOW</span><h3>The limits of this diagnosis</h3></div><EvidenceBadge level="unknown"/></div><ul className="unknown-list">{v.unknowns.map(s=><li key={s}>{s}</li>)}</ul></section>
    </div>
    <section className="next-test"><span className="eyebrow">05 / WHAT TO TRY NEXT</span><h3>{v.outcome==='above'?'Repeat the result before making it a rule.':v.outcome==='below'?'Change one thing. Keep the lesson.':'Build the evidence before the conclusion.'}</h3><p>{v.nextTest}</p><BrainLink to={{view:'briefs',example:v.id}} className="btn primary">Use this video in a new brief ↗</BrainLink><small>A proposed test, not a saved experiment or an automatic production action.</small></section>
    <ContentJourney contentId={v.id} data={data}/>
  </article>;
}
