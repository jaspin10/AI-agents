import { useEffect, useState } from 'react';
import type { BrainOverview, ConfirmedBrainLineage } from '@platform/shared';
import { getJson } from './api.js';
import { BrainLink, EvidenceBadge, date } from './brain-ui.js';
interface Journey {
  confirmed:Array<{link:ConfirmedBrainLineage;brief:{topic:string;researchIds:string[];exampleIds:string[];selectedHook:string|null;learningOutcome:string;approval:{by:string;at:string}|null}|null;suggestion:{id:string;theme:string;hypothesis:string|null}|null}>;
  notice:string;
}
export function ContentJourney({contentId,data}:{contentId:string;data:BrainOverview}) {
  const [journey,setJourney]=useState<Journey|null>(null),[error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;getJson<Journey>('/api/brain/journey/'+contentId).then(d=>{if(active){setJourney(d);setError(null);}}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[contentId,attempt]);
  const inferred=data.inferredEdges.filter(e=>e.outcomes.some(o=>o.contentId===contentId));
  const patterns=(data.learnings??[]).filter(p=>p.evidence.videoIds.includes(contentId));
  return <section className="card content-journey"><div className="panel-heading"><div><span className="eyebrow">CONTENT JOURNEY</span><h3>How this video connects</h3></div></div>
    {error?<div className="notice warning" role="alert">Confirmed lineage could not be read. Its status is unknown. <button className="btn" onClick={()=>setAttempt(n=>n+1)}>Retry</button></div>:!journey?<p role="status">Reading confirmed history…</p>:journey.confirmed.length?journey.confirmed.map(({link:l,brief:b,suggestion:s})=><div className="journey-record" key={l.id}>
      <p><EvidenceBadge level="confirmed"/> Human-confirmed {date(l.confirmed_at)} · export {l.asset_version}</p>
      <ol className="journey-stages"><li><span>Idea / hypothesis</span>{s?<><BrainLink to={{view:'idea-map',id:s.id}}>{s.theme}</BrainLink><small>{s.hypothesis??'No hypothesis recorded'}</small></>:<><EvidenceBadge level="unknown"/><small>No suggestion linked to this brief.</small></>}</li><li><span>Exact teaching brief</span><strong>{b?.topic??'Historical revision unavailable'}</strong><small>Revision {l.brief_version}</small><BrainLink to={{view:'briefs',id:l.brief_id}}>Open current brief</BrainLink></li><li><span>Production / review</span><strong>{l.asset_version}</strong><small>Confirmed by {l.confirmed_by}</small><BrainLink to={{view:'production',id:l.production_id}}>Open production history</BrainLink></li><li><span>Published / learning</span><strong>This video</strong><small>{patterns.length} contributing pattern(s)</small><BrainLink to={{view:'learnings'}}>Inspect learnings</BrainLink></li></ol>
      {b&&<details><summary>Historical brief context and source relationships</summary><p>Learning outcome: {b.learningOutcome}</p><p>Selected hook: {b.selectedHook??'Not recorded'}</p><p>Audience evidence:</p><div className="chips">{b.researchIds.map(id=><BrainLink key={id} to={{view:'audience',id}} className="chip">{id.slice(0,8)} ↗</BrainLink>)}</div>{!b.researchIds.length&&<p>No audience entry was linked.</p>}<p>The selected hook and audience links above come from the confirmed historical revision, even if the current brief has changed.</p></details>}
    </div>):<div className="notice"><EvidenceBadge level="unknown"/> No owner-confirmed brief/export link exists for this video. Its upstream idea and production journey remain incomplete.</div>}
    <details><summary>Historical inferred outcomes · {inferred.length}</summary><p>X6 matches by hypothesis or format and timing. These remain unconfirmed even when a confirmed link also exists.</p>{inferred.map(e=><p key={e.suggestionId}><EvidenceBadge level="inferred"/> <BrainLink to={{view:'idea-map',id:e.suggestionId}}>{e.suggestionTheme??'Historical suggestion'}</BrainLink></p>)}{!inferred.length&&<p>No inferred outcome links are recorded in the latest report.</p>}</details>
    <p className="hint">{journey?.notice??'Confirmed links and inferred relationships are separate. Missing data stays unknown.'} X1 twins remain available in Metrics & twins.</p>
  </section>;
}
