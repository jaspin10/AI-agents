import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { brainHistory, brainMetricValue, diagnoseVideos, type BrainAnalysis } from './brain-diagnosis.js';
import { brainAttention, brainIdeaLifecycle, brainHref, allowedBrainView, BRAIN_VIEWS, BRAIN_AGENTS, type BrainOverview } from './brain-model.js';
import type { ContentRow } from './schemas/content.js';
import type { PerformanceRecord } from './schemas/performance.js';
import type { CreativeMemory } from './creative-memory.js';

function fixture(n=9) {
  const content: ContentRow[] = Array.from({length:n},(_,i)=>({id:randomUUID(),platform:'tiktok',platformVideoId:'native-'+i,title:'Lesson '+i,hook:null,format:'Lesson',hypothesis:null,postedAt:'2026-09-01T12:00:00Z'}));
  const performance: PerformanceRecord[] = content.map(c=>({id:randomUUID(),contentId:c.platformVideoId,contentUuid:c.id!,platform:c.platform,capturedAt:'2026-09-08T12:00:00Z',capturedDate:'2026-09-08',metrics:{views:1000,likes:40,comments:10,shares:0,saves:null,avgWatchTimeSeconds:null,retentionPct:null,followersAtCapture:null}}));
  const analyses: BrainAnalysis[] = content.map(c=>({contentId:c.id!,format:'lesson',adBoosted:null,hookText:null,ctaType:null,description:null}));
  return {content,performance,analyses,today:'2026-09-09'};
}
const target=(f:ReturnType<typeof fixture>)=>diagnoseVideos(f).find(v=>v.id===f.content[0]!.id)!;
function empty():BrainOverview{return {generatedAt:'2026-09-09T12:00:00Z',sourceErrors:[],studioLimit:500,videos:[],suggestions:[],briefs:[],production:[],memories:[],topics:[],researchCount:0,learnings:[],lineage:[],insight:null,inferredEdges:[],pendingTags:0};}

test('canonical UUID and platform isolate native collisions, orphans and foreign snapshots',()=>{
  const f=fixture(2);f.content[1]!.platform='instagram';f.content[1]!.platformVideoId=f.content[0]!.platformVideoId;
  const p=f.performance[0]!;
  const history=brainHistory(f.content,[p,{...p,contentUuid:null},{...p,contentUuid:randomUUID()},{...p,platform:'instagram'}]);
  assert.equal(history.size,1);assert.equal(history.get(f.content[0]!.id!)!.length,1);
  assert.equal(diagnoseVideos({...f,performance:[]}).length,2);assert.equal(target({...f,performance:[]}).outcome,'unmeasured');
});
test('exact eight peers, target excluded, correct savings and symmetric ±20% outcomes',()=>{
  const f=fixture();const p=f.performance[0]!;
  assert.equal(target(f).comparison.n,8);assert.equal(target(f).comparison.medianRate,5);
  p.metrics.likes=50;assert.equal(target(f).outcome,'above');
  p.metrics.likes=30;assert.equal(target(f).outcome,'below');
  p.metrics.likes=40;assert.equal(target(f).outcome,'typical');
  for(const row of f.performance)row.metrics.saves=5;
  assert.equal(target(f).rates!.engagementRatePct,5.5);
  assert.equal(target(f).rates!.shareRatePct,null,'existing zero-share heuristic is preserved');
});
test('seven peers and low-view observations never become a supported comparison',()=>{
  const f=fixture(8);assert.equal(target(f).outcome,'insufficient');assert.equal(target(f).comparison.medianRate,null);
  const nine=fixture();nine.performance[1]!.metrics.views=99;assert.equal(target(nine).comparison.n,7);
  nine.performance[0]!.metrics.views=0;assert.equal(target(nine).rates!.engagementRatePct,null);assert.equal(target(nine).outcome,'insufficient');
});
test('platform, format, ad status and exact age are independent cohort boundaries',()=>{
  for(const change of ['platform','format','exposure','age'] as const){const f=fixture();
    if(change==='platform'){f.content[1]!.platform='instagram';f.performance[1]!.platform='instagram';}
    if(change==='format')f.analyses[1]!.format='skit';
    if(change==='exposure')f.analyses[1]!.adBoosted=false;
    if(change==='age')f.performance[1]!.capturedDate='2026-09-07';
    assert.equal(target(f).comparison.n,7,change);assert.equal(target(f).outcome,'insufficient',change);
  }
});
test('known duration must match within 20%; unknown duration cannot match known',()=>{
  const f=fixture();const memories=new Map<string,CreativeMemory>();
  for(const c of f.content)memories.set(c.id!,{durationSeconds:60} as CreativeMemory);
  memories.get(f.content[1]!.id!)!.durationSeconds=73;
  let v=diagnoseVideos({...f,memories}).find(v=>v.id===f.content[0]!.id)!;assert.equal(v.comparison.n,7);
  memories.get(f.content[1]!.id!)!.durationSeconds=72;
  v=diagnoseVideos({...f,memories}).find(v=>v.id===f.content[0]!.id)!;assert.equal(v.comparison.n,8);
  memories.delete(f.content[1]!.id!);assert.equal(diagnoseVideos({...f,memories})[0]!.outcome,'insufficient');
});
test('different native definitions, legacy definitions and unavailable fields never mix',()=>{
  const f=fixture();const p=f.performance[0]!;
  p.provenance={views:{nativeName:'plays',source:'fixture',observationWindow:'lifetime',capturedAt:p.capturedAt,denominator:null,definitionVersion:'v2',availability:'observed'}};
  assert.equal(target(f).comparison.n,0);
  for(const row of f.performance)row.provenance=structuredClone(p.provenance);
  assert.equal(target(f).comparison.n,8);
  f.performance[1]!.provenance!.views!.definitionVersion='v1';assert.equal(target(f).comparison.n,7);
  for(const row of f.performance)row.provenance!.views!.availability='error';
  assert.equal(target(f).outcome,'insufficient');assert.match(target(f).comparison.reason,/availability/);
  assert.equal(target(f).rates!.engagementRatePct,null);assert.equal(brainMetricValue(target(f),'views'),null);
});
test('prefer a mature qualifying window; latest totals are separate and approximate history cannot substitute',()=>{
  const f=fixture();f.performance.push(...f.performance.map(p=>({...p,id:randomUUID(),capturedDate:'2026-10-01',capturedAt:'2026-10-01T12:00:00Z',metrics:{...p.metrics,views:5000}})));
  assert.equal(target(f).comparison.day,30);assert.equal(target(f).metrics!.views,5000);
  f.performance=f.performance.filter(p=>p.capturedDate!=='2026-10-01'||p.contentUuid===f.content[0]!.id);
  assert.equal(target(f).comparison.day,7);assert.equal(target(f).metrics!.views,5000);
  f.performance=f.performance.map(p=>({...p,capturedDate:'2026-09-07',capturedAt:'2026-09-07T12:00:00Z'}));
  assert.equal(target(f).outcome,'insufficient');assert.equal(target(f).comparison.day,null);
});
test('zero peer median abstains, unknown format abstains, and stale data is explicit',()=>{
  const f=fixture();for(const p of f.performance){p.metrics.likes=0;p.metrics.comments=0;}
  assert.equal(target(f).outcome,'insufficient');assert.match(target(f).comparison.reason,/zero/);
  f.content[0]!.format=null;f.analyses[0]!.format=null;assert.match(target(f).comparison.reason,/Add a format/);
  f.today='2026-09-22';assert.equal(target(f).stale,true);
});
test('deterministic input order, duplicate capture choice and bounded evidence payload',()=>{
  const f=fixture(70);const forward=diagnoseVideos(f);
  assert.deepEqual(forward,diagnoseVideos({...f,content:[...f.content].reverse(),performance:[...f.performance].reverse()}));
  assert.equal(target(f).comparison.n,69);assert.equal(target(f).comparison.peers.length,60);
  const p=f.performance[0]!;f.performance.push({...p,id:randomUUID(),capturedAt:'2026-09-08T23:00:00Z',metrics:{...p.metrics,views:2000}});
  assert.equal(target(f).snapshotCount,1);assert.equal(target(f).metrics!.views,2000);
});
test('overview projections and a focused detail retain the same cohort and outcome',()=>{
  const f=fixture(70),full=target(f),compact=diagnoseVideos({...f,peerLimit:0}).find(v=>v.id===full.id)!;
  assert.equal(compact.comparison.peers.length,0);assert.equal(compact.comparison.n,full.comparison.n);assert.equal(compact.comparison.medianRate,full.comparison.medianRate);assert.equal(compact.outcome,full.outcome);
  assert.deepEqual(diagnoseVideos({...f,focusId:full.id}),[full]);
});
test('hypotheses need recorded inputs and never invent retention curves or causal confidence',()=>{
  const f=fixture();assert.equal(target(f).possibleCauses.length,0);
  f.analyses[0]!.hookText='Try this French phrase';f.analyses[0]!.ctaType='Practice aloud';
  const v=target(f);assert.equal(v.possibleCauses.length,2);assert.match(v.possibleCauses[0]!.hypothesis,/No opening-retention/);assert.match(v.unknowns[0]!,/not supplied/);
});
test('attention has exact actionable targets and ignores completed due dates',()=>{
  const data=empty(),id=randomUUID();data.production=[{id,briefId:randomUUID(),briefVersion:1,topic:'Lesson',stage:'edit_review',owner:'Jas',dueDate:'2026-09-01',blockers:['Missing audio'],openRequests:2,updatedAt:data.generatedAt}];
  let items=brainAttention(data,'2026-09-09');assert.equal(items.length,1);assert.equal(items[0]!.tone,'blocked');assert.deepEqual(items[0]!.target,{view:'production',id});
  data.production[0]!.blockers=[];assert.match(brainAttention(data,'2026-09-09')[0]!.detail,/2 open/);
  data.production[0]!.stage='posted';assert.equal(brainAttention(data,'2026-09-09').length,0);
  data.pendingTags=3;assert.deepEqual(brainAttention(data,'2026-09-09')[0]!.target,{view:'insights',filter:'tags'});
  data.production=null;data.pendingTags=null;assert.deepEqual(brainAttention(data,'2026-09-09'),[]);
});
test('idea lifecycle does not turn inferred or marked-posted links into confirmation',()=>{
  const data=empty(),id=randomUUID();data.suggestions=[{id,theme:'Lesson',hypothesis:null,status:'posted',createdAt:data.generatedAt,evidenceIds:[],evidenceMode:'exploration'}];
  assert.equal(brainIdeaLifecycle(id,data),'Marked posted · lineage unknown');
  data.inferredEdges=[{suggestionId:id,outcomes:[{}]} as BrainOverview['inferredEdges'][number]];
  assert.equal(brainIdeaLifecycle(id,data),'Inferred outcome · unconfirmed');
  const bid=randomUUID();data.briefs=[{id:bid,version:2,topic:'Lesson',platform:'tiktok',suggestionId:id,exampleIds:[],approved:false,readyForReview:false,draft:false,updatedAt:data.generatedAt}];
  assert.equal(brainIdeaLifecycle(id,data),'Brief in progress');
  data.lineage=[{id:randomUUID(),production_id:randomUUID(),brief_id:bid,brief_version:1,content_uuid:randomUUID(),asset_version:'v1',confirmed_at:data.generatedAt,confirmed_by:'Jas',suggestionId:id}];
  assert.equal(brainIdeaLifecycle(id,data),'Published · evaluate results');
});
test('role boundaries, safe deep-link encoding and existing-only agent grammar',()=>{
  for(const v of BRAIN_VIEWS){assert.equal(allowedBrainView(v,'owner'),true);assert.equal(allowedBrainView(v,'marketing'),!['kpis','run-log'].includes(v));assert.equal(allowedBrainView(v,'student'),false);}
  const href=brainHref({view:'briefs',idea:'x&role=owner',example:'a/b'});assert.equal(new URL(href,'https://example.com').searchParams.get('idea'),'x&role=owner');
  assert.deepEqual(BRAIN_AGENTS.map(a=>a.id),['analyst','insights','brief']);for(const a of BRAIN_AGENTS){assert.ok(a.humanApproval);assert.ok(a.inputs.length&&a.outputs.length&&a.allowedActions.length);}
});
