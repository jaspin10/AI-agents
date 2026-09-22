import { lazy, Suspense, useEffect, useState } from 'react';
import { allowedBrainView, BRAIN_VIEWS, type BrainView } from '@platform/shared/browser';
import { getMe, type Me } from './api.js';
import { BrainLink, BrainNavigation, Icon } from './brain-ui.js';
import { Guide } from './Guide.js';

const Brain = lazy(()=>import('./Brain.js').then(m=>({default:m.Brain})));
const Performance = lazy(()=>import('./Performance.js').then(m=>({default:m.Performance})));
const Analysis = lazy(()=>import('./Analysis.js').then(m=>({default:m.Analysis})));
const Metrics = lazy(()=>import('./Metrics.js').then(m=>({default:m.Metrics})));
const Insights = lazy(()=>import('./Insights.js').then(m=>({default:m.Insights})));
const Suggestions = lazy(()=>import('./Suggestions.js').then(m=>({default:m.Suggestions})));
const IdeaMap = lazy(()=>import('./IdeaMap.js').then(m=>({default:m.IdeaMap})));
const AudienceResearch = lazy(()=>import('./AudienceResearch.js').then(m=>({default:m.AudienceResearch})));
const BriefWorkspace = lazy(()=>import('./BriefWorkspace.js').then(m=>({default:m.BriefWorkspace})));
const ProductionBoard = lazy(()=>import('./ProductionBoard.js').then(m=>({default:m.ProductionBoard})));
const Learnings = lazy(()=>import('./Learnings.js').then(m=>({default:m.Learnings})));
const Kpis = lazy(()=>import('./Kpis.js').then(m=>({default:m.Kpis})));
const RunLog = lazy(()=>import('./RunLog.js').then(m=>({default:m.RunLog})));

const WORKSPACES: Array<{name:string;icon:string;views:BrainView[]}> = [
  {name:'Brain',icon:'brain',views:['brain']},
  {name:'Audience',icon:'audience',views:['audience']},
  {name:'Create',icon:'creative',views:['suggestions','idea-map','briefs','production']},
  {name:'Results',icon:'results',views:['performance','analysis','metrics']},
  {name:'Learnings',icon:'learning',views:['learnings','insights']},
  {name:'Business',icon:'strategy',views:['kpis']},
  {name:'System',icon:'system',views:['run-log']},
];
const COPY: Record<BrainView,{title:string;description:string;tab:string}> = {
  brain:{title:'Your marketing brain.',description:'One connected loop. Every idea has a path; every decision starts with evidence.',tab:'Overview'},
  audience:{title:'Start with a real question.',description:'Collect the audience evidence that makes the next lesson useful.',tab:'Audience research'},
  suggestions:{title:'Make the next video count.',description:'Choose an idea, shape its brief, and move it through human review.',tab:'Suggestions'},
  'idea-map':{title:'Ideas, connected to evidence.',description:'Follow a hypothesis from its sources to the work it inspired.',tab:'Ideas & hypotheses'},
  briefs:{title:'From an idea to a useful lesson.',description:'Choose a hook, shape the script, then approve the exact teaching brief.',tab:'Briefs'},
  production:{title:'Keep the work moving.',description:'One concept, one clear handoff, one reviewed export.',tab:'Production'},
  performance:{title:'What happened. What to try next.',description:'Inspect results with their evidence, limitations and content journey.',tab:'Videos & diagnosis'},
  analysis:{title:'Give each video its context.',description:'Human observations make later patterns more useful. This is the original Analysis editor.',tab:'Content notes'},
  metrics:{title:'Look behind the numbers.',description:'Compare snapshots, cross-platform twins and the original X2 calculations.',tab:'Metrics & twins'},
  learnings:{title:'What we are learning.',description:'Our history, its evidence, and the next question worth testing.',tab:'Creative memory'},
  insights:{title:'Read the pattern report.',description:'Platform-specific findings and suggested tags, with the standing cautions intact.',tab:'Pattern reports'},
  kpis:{title:'Business visibility.',description:'Owner-only enrollment visibility and weekly analysis progress.',tab:'Business KPIs'},
  'run-log':{title:'The recorded system activity.',description:'Owner-only audit trail for completed, rejected and failed agent calls.',tab:'Run log'},
};
function routeFromLocation():{view:BrainView;search:string} {
  const slug=window.location.pathname.split('/').filter(Boolean).filter(s=>s!=='analytics').join('/');
  return {view:BRAIN_VIEWS.includes(slug as BrainView)?slug as BrainView:'brain',search:window.location.search};
}
export function App() {
  const [me,setMe]=useState<Me|null>(null),[error,setError]=useState<string|null>(null),[route,setRoute]=useState(routeFromLocation);
  useEffect(()=>{getMe().then(setMe).catch(e=>setError(e.message));},[]);
  useEffect(()=>{const pop=()=>setRoute(routeFromLocation());window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  const view=me&&allowedBrainView(route.view,me.role)?route.view:'brain';
  function navigate(url:string) {
    if(window.location.pathname+window.location.search!==url)window.history.pushState(null,'',url);
    setRoute(routeFromLocation());
    document.getElementById('main-content')?.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'instant'});
  }
  useEffect(()=>{
    if(!me)return;
    if(!allowedBrainView(route.view,me.role)||window.location.pathname==='/analytics'||window.location.pathname==='/analytics/') {
      window.history.replaceState(null,'','/analytics/brain');setRoute(routeFromLocation());
    }
  },[me,route.view]);
  if(error)return <div className="card session-state" role="alert"><h1>Unable to open your workspace</h1><p>{error}</p><button className="btn" onClick={()=>window.location.reload()}>Try again</button></div>;
  if(!me)return <div className="card session-state" role="status"><span className="eyebrow">French with Jas</span><h1>Opening your workspace…</h1><p className="dim">Checking your session.</p></div>;
  const workspace=WORKSPACES.find(w=>w.views.includes(view))!;
  return <BrainNavigation.Provider value={navigate}><div className="layout">
    <aside className="sidebar">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="logo"><span className="brand-mark">J.</span><div>French with Jas<span>MARKETING INTELLIGENCE</span></div></div>
      <nav aria-label="Marketing workspaces"><div className="nav-label">Your learning loop</div>{WORKSPACES.filter(w=>allowedBrainView(w.views[0]!,me.role)).map(w=>
        <BrainLink key={w.name} to={{view:w.views[0]!}} className={'nav-item '+(w===workspace?'active':'')} aria-current={w===workspace?'page':undefined}><Icon name={w.icon}/><span>{w.name}</span><span className="nav-arrow" aria-hidden="true">↗</span></BrainLink>
      )}</nav>
      <div className="sidebar-principle"><span className="eyebrow">THE WAY WE WORK</span><p>Evidence informs.<br/>People decide.</p><span>No automatic publishing</span></div>
      <div className="sidebar-account"><span className="account-avatar">{me.email.slice(0,1).toUpperCase()}</span><div><span className="account-email" title={me.email}>{me.email}</span><span className="account-role">{me.role} workspace</span></div></div>
    </aside>
    <main className="main" id="main-content" tabIndex={-1}>
      <header className="page-header"><div><div className="eyebrow">MARKETING / {workspace.name}</div><h1>{COPY[view].title}</h1><p>{COPY[view].description}</p></div><Guide key={view} area={view}/></header>
      {workspace.views.length>1&&<nav className="workspace-tabs" aria-label={workspace.name+' views'}>{workspace.views.map(v=><BrainLink key={v} to={{view:v}} className={view===v?'selected':''} aria-current={view===v?'page':undefined}>{COPY[v].tab}</BrainLink>)}</nav>}
      <Suspense fallback={<div className="card" role="status">Opening workspace…</div>}><div key={view+route.search}>
        {view==='brain'?<Brain/>:view==='audience'?<AudienceResearch standalone/>:view==='suggestions'?<Suggestions/>:view==='idea-map'?<IdeaMap/>:view==='briefs'?<BriefWorkspace/>:view==='production'?<ProductionBoard standalone/>:view==='performance'?<Performance/>:view==='analysis'?<Analysis/>:view==='metrics'?<Metrics/>:view==='learnings'?<Learnings/>:view==='insights'?<Insights/>:view==='kpis'?<Kpis/>:<RunLog/>}
      </div></Suspense>
    </main>
  </div></BrainNavigation.Provider>;
}
