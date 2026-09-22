import { useEffect, useState } from 'react';
import { brainIdeaLifecycle } from '@platform/shared/browser';
import { getJson, type SuggestionRow } from './api.js';
import { BrainLink, BrainLoading, BrainSourceNotice, EvidenceBadge, useBrain, percent } from './brain-ui.js';
export function IdeaMap() {
  const {data,error,refresh}=useBrain();
  const [rows,setRows]=useState<SuggestionRow[]|null>(null),[readError,setReadError]=useState<string|null>(null);
  const [selectedId,setSelectedId]=useState<string|null>(new URLSearchParams(window.location.search).get('id'));
  const [filter,setFilter]=useState('all'),[limit,setLimit]=useState(40);
  useEffect(()=>{getJson<SuggestionRow[]>('/api/suggestions').then(setRows).catch(e=>setReadError(String(e)));},[]);
  if(!data||!rows)return <BrainLoading error={error??readError} retry={()=>{refresh();getJson<SuggestionRow[]>('/api/suggestions').then(setRows).catch(e=>setReadError(String(e)));}}/>;
  const selected=rows.find(s=>s.id===selectedId);
  const groups=[...new Set(rows.map(s=>s.hypothesis??'untagged'))];
  const edge=data.inferredEdges.find(e=>e.suggestionId===selectedId);
  const sources=selected?.payload.evidenceContentIds??edge?.sourceVideoIds??[];
  const sourceLabel=(id:string)=>data.videos?.find(v=>v.id===id)?.title??id;
  const briefs=data.briefs?.filter(b=>b.suggestionId===selectedId)??[];
  const confirmed=data.lineage?.filter(l=>l.suggestionId===selectedId)??[];
  const claims=(data.learnings??[]).filter(p=>p.dimension==='hypothesis'&&p.value===selected?.hypothesis);
  const direction=claims.some(p=>p.direction==='works')&&claims.some(p=>p.direction==='doesnt')?'Mixed patterns across platforms':claims.some(p=>p.direction==='works')?'Supported association':claims.some(p=>p.direction==='doesnt')?'Contrary pattern':claims.length?'Weak / no material difference':'Needs more data';
  return <><BrainSourceNotice data={data}/><div className="idea-layout">
    <div><div className="card"><label className="field"><span className="field-label">Hypothesis</span><select className="select" value={filter} onChange={e=>{setFilter(e.target.value);setLimit(40);}}><option value="all">All hypotheses</option>{groups.map(g=><option key={g}>{g}</option>)}</select></label><p className="dim">Select an idea to follow its evidence and production links. A tag is a hypothesis, not a proven rule.</p></div>
      {rows.filter(s=>filter==='all'||(s.hypothesis??'untagged')===filter).slice(0,limit).map(s=><button key={s.id} className={'idea-record '+(s.id===selectedId?'selected':'')} aria-pressed={s.id===selectedId} onClick={()=>setSelectedId(s.id)}><span className="eyebrow">{s.hypothesis??'UNTAGGED'}</span><strong>{s.payload.theme??'Untitled idea'}</strong><span className="badge">{brainIdeaLifecycle(s.id,data)}</span><small>Suggestion: {s.status} · {s.payload.evidenceContentIds?.length??0} recorded source citations</small></button>)}
      {rows.filter(s=>filter==='all'||(s.hypothesis??'untagged')===filter).length>limit&&<button className="btn" onClick={()=>setLimit(n=>n+40)}>Show more ideas</button>}
      {!rows.length&&<div className="card empty-state"><strong>No ideas yet</strong><p>Saved suggestions will appear here with their evidence.</p></div>}
    </div>
    <div className="idea-detail">{selected?<section className="card"><span className="eyebrow">IDEA JOURNEY</span><h2>{selected.payload.theme}</h2><p className="idea-hook">{selected.payload.hook}</p><p>{selected.payload.rationale}</p><div className="notice"><strong>{brainIdeaLifecycle(selected.id,data)}</strong><p>Hypothesis evidence: {direction}. These are observational signals, not a validated experiment result.</p></div>
      <h3>01 / Source evidence</h3><EvidenceBadge level={selected.payload.evidenceContentIds?'observed':'inferred'}/><p className="hint">{selected.payload.evidenceContentIds?'Citations saved with the suggestion. They establish its inputs, not whether the idea works.':'Historical sources matched by tag. They were not recorded as prompt citations.'}</p><ul className="evidence-links">{sources.map(id=><li key={id}><BrainLink to={{view:'performance',id}}>{sourceLabel(id)}</BrainLink></li>)}</ul>{!sources.length&&<p className="dim">No source video recorded. Creative exploration.</p>}
      <h3>02 / Brief → production</h3>{briefs.length?briefs.map(b=><div key={b.id}><BrainLink to={{view:'briefs',id:b.id}}>{b.topic} · v{b.version}</BrainLink>{data.production?.filter(p=>p.briefId===b.id).map(p=><p key={p.id}><BrainLink to={{view:'production',id:p.id}}>Production: {p.stage.replaceAll('_',' ')} ↗</BrainLink></p>)}</div>):<p className="dim">No saved brief points to this idea. Select it in Briefs to start.</p>}
      <h3>03 / Published outcome</h3>{confirmed.map(l=><p key={l.id}><EvidenceBadge level="confirmed"/> <BrainLink to={{view:'performance',id:l.content_uuid}}>{sourceLabel(l.content_uuid)}</BrainLink> · brief v{l.brief_version} / export {l.asset_version}</p>)}{!confirmed.length&&<p><EvidenceBadge level="unknown"/> No confirmed published link in the loaded records.</p>}
      {(edge?.outcomes??[]).map(o=><p key={o.contentId}><EvidenceBadge level="inferred"/> <BrainLink to={{view:'performance',id:o.contentId}}>{sourceLabel(o.contentId)}</BrainLink><small className="subtle-label">{o.platform} · {percent(o.engagementRatePct)} vs stored platform median {percent(o.platformMedianPct)} · auto-matched on {o.matchedOn}</small></p>)}
      {claims.map(c=><p key={c.platform+c.value}><EvidenceBadge level="pattern"/> {c.platform}: {percent(c.medianEngagementPct)} group median vs {percent(c.platformMedianPct)} platform median, n={c.n}.</p>)}
      <p className="hint">Production does not make a hypothesis supported. Formal tested/supported/contradicted experiment decisions are not recorded yet. Inferred matches never become confirmed automatically.</p>
      <BrainLink to={{view:'briefs',idea:selected.id}} className="btn primary">Open Briefs ↗</BrainLink>
    </section>:<section className="card empty-state"><strong>{selectedId?'This idea is unavailable. Choose another saved idea.':'Pick an idea to follow its story.'}</strong><p>Source evidence → brief → production → confirmed or inferred outcome.</p></section>}</div>
  </div></>;
}
