import { useState } from 'react';
import { BRAIN_AGENTS, BRAIN_CONNECTIONS, brainAttention, PRODUCTION_LABELS, type BrainOverview, type BrainTarget, type BrainVideo } from '@platform/shared/browser';
import { BrainLink, BrainLoading, BrainSourceNotice, EvidenceBadge, Icon, useBrain, number, percent, date } from './brain-ui.js';

interface Stage { id:string;name:string;icon:string;line:string;state:string;input:string;output:string;target:BrainTarget }
function stages(data:BrainOverview):Stage[] {
  const count=(n:number|null|undefined,s:string)=>n==null?'Source unavailable':number(n)+' '+s;
  return [
    {id:'strategy',name:'Strategy',icon:'strategy',line:'Teach well. Build trust.',state:'Human direction',input:'Approved brand rules and a human-selected viewer, lesson and goal.',output:'A specific creative direction. Prices, timelines and factual claims still need dated review.',target:{view:'briefs'}},
    {id:'audience',name:'Audience',icon:'audience',line:count(data.topics?.length,'topic opportunities'),state:count(data.researchCount,'active entries'),input:'Approved, anonymous questions and human-selected public references.',output:'Topics with distinct inbox evidence and explicit relevance.',target:{view:'audience'}},
    {id:'creative',name:'Creative',icon:'creative',line:count(data.suggestions?.filter(s=>s.status==='surfaced').length,'ideas to consider'),state:count(data.briefs?.filter(b=>b.readyForReview&&!b.approved).length,'briefs ready for review'),input:'Audience questions, source videos and a chosen hypothesis.',output:'Hook → script → teaching brief. Every revision stays attached to human review.',target:{view:'briefs'}},
    {id:'production',name:'Production',icon:'production',line:count(data.production?.filter(p=>!['posted','reviewed'].includes(p.stage)).length,'items in progress'),state:count(data.production?.filter(p=>p.blockers.length>0).length,'blocked items'),input:'An exact brief revision, assigned people and approved asset references.',output:'A reviewed export; after external publication, an owner-confirmed video link.',target:{view:'production'}},
    {id:'results',name:'Results',icon:'results',line:count(data.videos?.filter(v=>v.metrics!==null).length,'videos with snapshots'),state:count(data.videos?.filter(v=>v.outcome==='below').length,'below comparable baseline'),input:'Platform snapshots and human context, joined by content UUID.',output:'Observed results, explicit unknowns and a testable next change.',target:{view:'performance'}},
    {id:'learning',name:'Learnings',icon:'learning',line:count(data.learnings?.length,'stored patterns'),state:count(data.memories?.length,'creative memory records'),input:'Platform-specific reports and versioned human observations.',output:'Our own evidence to repeat, challenge or use in the next brief.',target:{view:'learnings'}},
  ];
}
export function BrainMap({data}:{data:BrainOverview}) {
  const nodes=stages(data),[selected,setSelected]=useState('creative');
  const node=nodes.find(n=>n.id===selected)!;
  const paths:Record<string,string>={strategy:'M180 78H430',audience:'M480 78H725',creative:'M750 98V250',production:'M720 280H470',results:'M420 280H175',learning:'M150 260V100'};
  return <section className="brain-map-panel">
    <div className="panel-heading"><div><span className="eyebrow">THE LEARNING LOOP</span><h2>Everything has a next step.</h2></div><span className="subtle-label">Select a stage to explore</span></div>
    <div className="brain-map">
      <svg className="brain-connectors" viewBox="0 0 900 360" preserveAspectRatio="none" aria-hidden="true">
        <defs><marker id="brain-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 7 3.5 0 7" fill="#687b8b"/></marker></defs>
        {BRAIN_CONNECTIONS.map(edge=><path key={edge.from} className={edge.from==='learning'?'loop-return':undefined} d={paths[edge.from]} markerEnd="url(#brain-arrow)"/>)}
      </svg>
      {nodes.map((n,i)=><button key={n.id} type="button" className={'brain-node node-'+n.id+(selected===n.id?' is-selected':'')} style={{gridArea:n.id}} aria-pressed={selected===n.id} aria-controls="stage-detail" onClick={()=>setSelected(n.id)}>
        <span className="node-top"><span className="node-icon"><Icon name={n.icon}/></span><span className="node-step">{String(i+1).padStart(2,'0')}</span></span>
        <strong>{n.name}</strong><span className="node-count">{n.line}</span><span className="node-state">{n.state}</span>
      </button>)}
    </div>
    <div className={'stage-detail stage-'+node.id} id="stage-detail"><div><span className="eyebrow">{node.name} / INPUT</span><p>{node.input}</p></div><div><span className="eyebrow">OUTPUT / NEXT HANDOFF</span><p>{node.output}</p></div><BrainLink className="btn" to={node.target}>Open {node.name.toLowerCase()} <span aria-hidden="true">↗</span></BrainLink></div>
    <p className="map-caption">Lines show workflow relationships. Counts are saved records; they do not imply live agent activity.</p>
  </section>;
}
function ResultList({rows,positive}:{rows:BrainVideo[];positive:boolean}) {
  return <section className="card result-peek"><div className="panel-heading"><div><span className="eyebrow">{positive?'WORTH REPEATING':'WORTH INVESTIGATING'}</span><h2>{positive?'Above baseline':'Below baseline'}</h2></div><span className={'result-symbol '+(positive?'up':'down')} aria-hidden="true">{positive?'↗':'↘'}</span></div>
    {rows.length?rows.slice(0,3).map(v=><BrainLink to={{view:'performance',id:v.id}} key={v.id} className="result-row"><div><span className="subtle-label">{v.platform} · day {v.comparison.day}</span><strong>{v.title??'Untitled video'}</strong><span>{percent(v.comparison.targetRate)} engagement · peer median {percent(v.comparison.medianRate)}</span></div><span className="row-arrow" aria-hidden="true">↗</span></BrainLink>):<div className="quiet-empty">No qualifying comparison in this snapshot. We need at least eight comparable peers before calling a result {positive?'above':'below'} baseline.</div>}
    <p className="hint">Per-video, per-platform comparisons. These are signals to investigate, not causes.</p>
  </section>;
}
export function Brain() {
  const {data,error,loading,refresh}=useBrain();
  if(!data)return <BrainLoading error={error} retry={refresh}/>;
  const attention=brainAttention(data,data.generatedAt.slice(0,10));
  const activity=[
    ...(data.suggestions??[]).slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,5).map(s=>({id:'s-'+s.id,at:s.createdAt,title:'Suggestion recorded',detail:s.theme,target:{view:'suggestions',id:s.id} as BrainTarget})),
    ...(data.briefs??[]).slice(0,5).map(b=>({id:'b-'+b.id,at:b.updatedAt,title:b.approved?'Brief approved':'Brief revision saved',detail:b.topic+' · v'+b.version,target:{view:'briefs',id:b.id} as BrainTarget})),
    ...(data.production??[]).slice(0,5).map(p=>({id:'p-'+p.id,at:p.updatedAt,title:'Production: '+PRODUCTION_LABELS[p.stage],detail:p.topic,target:{view:'production',id:p.id} as BrainTarget})),
    ...(data.insight?[{id:'i-'+data.insight.id,at:data.insight.createdAt,title:'Pattern report stored',detail:data.insight.status==='numbers_only'?'Numbers-only report':'Report with narrative',target:{view:'insights'} as BrainTarget}]:[]),
  ].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,6);
  const freshest=(data.videos??[]).flatMap(v=>v.capturedDate?[v.capturedDate]:[]).sort().at(-1);
  const recentLearning=data.learnings?.find(p=>p.direction!=='neutral');
  const recentIdeas=(data.suggestions??[]).filter(s=>s.status==='surfaced').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,3);
  return <>
    <BrainSourceNotice data={data}/>{error&&<div className="notice warning">Refresh failed. Showing the earlier snapshot. {error}</div>}
    <div className="brain-status"><span className="snapshot-label"><span className="status-dot"/>Workspace read {new Date(data.generatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span><span>Newest platform snapshot: {date(freshest)}</span><button className="text-action" onClick={refresh} disabled={loading}>{loading?'Reading…':'Refresh snapshot ↻'}</button></div>
    <div className="brain-primary"><BrainMap data={data}/><aside className="attention-panel"><div className="panel-heading"><div><span className="eyebrow">HUMAN DECISIONS</span><h2>Needs attention</h2></div><span className="count-badge">{attention.length}</span></div>
      <p className="dim">Start where your decision moves work forward.</p>
      {attention.length?attention.slice(0,6).map(a=><BrainLink key={a.key} to={a.target} className={'attention-item attention-'+a.tone}><span className="attention-marker" aria-hidden="true">{a.tone==='blocked'?'!':a.tone==='review'?'✓':'↗'}</span><span><strong>{a.title}</strong><small>{a.detail}</small></span><span aria-hidden="true">→</span></BrainLink>):<div className="quiet-empty"><strong>No recorded review tasks.</strong><p>Collect a question or choose an idea to move the loop forward.</p></div>}
      {attention.length>6&&<details className="more-attention"><summary>{attention.length-6} more recorded tasks</summary>{attention.slice(6).map(a=><BrainLink key={a.key} to={a.target} className="attention-item"><span><strong>{a.title}</strong><small>{a.detail}</small></span></BrainLink>)}</details>}
      <div className="attention-footer"><span className="lock-mark" aria-hidden="true">◇</span> Approval stays with you.</div>
    </aside></div>
    <div className="brain-two"><ResultList rows={(data.videos??[]).filter(v=>v.outcome==='above')} positive/><ResultList rows={(data.videos??[]).filter(v=>v.outcome==='below')} positive={false}/></div>
    <section className="card learning-peek"><div className="panel-heading"><div><span className="eyebrow">WHAT WE HAVE LEARNED</span><h2>{recentLearning?recentLearning.value:'The evidence comes first.'}</h2></div><BrainLink to={{view:'learnings',filter:recentLearning?.platform}} className="text-action">Inspect the evidence ↗</BrainLink></div>
      {recentLearning?<><EvidenceBadge level="pattern"/><p>{recentLearning.platform} · {recentLearning.dimension.replaceAll('_',' ')} · {percent(recentLearning.medianEngagementPct)} group median vs {percent(recentLearning.platformMedianPct)} platform median, n={recentLearning.n}. Saved {date(recentLearning.recordedAt)}. Test whether this association repeats; it does not establish a cause.</p></>:<p>{data.learnings===null?'The report source is unavailable. No learning count can be inferred.':'No material stored pattern yet. Record video context and review comparable outcomes before promoting an idea into a rule.'}</p>}
    </section>
    <section className="card production-overview"><div className="panel-heading"><div><span className="eyebrow">IN MOTION</span><h2>The production desk</h2></div><BrainLink to={{view:'production'}} className="text-action">Open board ↗</BrainLink></div><div className="production-counts">{Object.entries(PRODUCTION_LABELS).map(([stage,label])=><BrainLink key={stage} to={{view:'production',filter:stage}}><strong>{data.production?number(data.production.filter(p=>p.stage===stage).length):'—'}</strong><span>{label}</span></BrainLink>)}</div></section>
    <div className="brain-two">
      <section className="card"><div className="panel-heading"><div><span className="eyebrow">CLOSE THE LOOP</span><h2>What to explore next</h2></div><BrainLink to={{view:'suggestions'}} className="text-action">All ideas ↗</BrainLink></div>
        {recentIdeas.length?recentIdeas.map(s=><BrainLink key={s.id} to={{view:'suggestions',id:s.id}} className="experiment-row"><EvidenceBadge level="hypothesis"/><strong>{s.theme}</strong><span>{s.evidenceIds.length?number(s.evidenceIds.length)+' cited videos':'Creative exploration · inspect evidence before committing'}</span></BrainLink>):<div className="quiet-empty">No surfaced ideas yet. <BrainLink to={{view:'audience'}}>Start from a real audience question.</BrainLink></div>}
      </section>
      <section className="card"><div className="panel-heading"><div><span className="eyebrow">RECORDED ACTIVITY</span><h2>The latest work</h2></div><span className="subtle-label">Snapshot, not a live feed</span></div>
        {activity.length?<ol className="activity-list">{activity.map(a=><li key={a.id}><span className="activity-dot"/><BrainLink to={a.target}><strong>{a.title}</strong><span>{a.detail}</span><time dateTime={a.at}>{date(a.at)}</time></BrainLink></li>)}</ol>:<div className="quiet-empty">No saved creative activity in the available sources.</div>}
      </section>
    </div>
    <section className="card"><div className="panel-heading"><div><span className="eyebrow">THE EXISTING SYSTEM</span><h2>Who does what</h2></div><span className="subtle-label">Capabilities, with clear limits</span></div><div className="agent-grid">{BRAIN_AGENTS.map(a=><details className="agent-card" key={a.id}><summary><Icon name={a.id==='insights'?'results':'creative'}/><span>{a.name}</span></summary><p>{a.purpose}</p><dl><dt>Inputs</dt><dd>{a.inputs.join(' · ')}</dd><dt>Outputs</dt><dd>{a.outputs.join(' · ')}</dd><dt>Allowed actions</dt><dd>{a.allowedActions.join(' · ')}</dd><dt>Human decision</dt><dd>{a.humanApproval}</dd><dt>Dependencies → consumers</dt><dd>{a.upstream.join(', ')} → {a.downstream.join(', ')}</dd><dt>Latest work / status</dt><dd>{a.id==='insights'?(data.insight?.running?'Manual run in progress':data.insight?'Last report '+date(data.insight.createdAt):'No stored report'):a.id==='analyst'?(recentIdeas[0]?'Latest surfaced idea '+date(recentIdeas[0].createdAt):'No surfaced idea recorded'):'Open a brief to inspect its generation-job history.'}</dd></dl></details>)}</div><p className="hint">New agents can use this input → output → approval structure. No future agents are shown as active.</p></section>
    <p className="data-footnote">Audience, brief, production and confirmed-link summaries cover the latest {data.studioLimit} records per source. Direct record links open their own history. Counts describe the available records, not all audience demand.</p>
  </>;
}
