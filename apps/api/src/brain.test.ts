import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { newBrief, type BrainOverview, type BriefInput } from '@platform/shared';
import { createBrainRouter, type BrainDependencies } from './brain.js';
import type { StudioEnv } from './studio.js';

function fixture(role:string|null='marketing') {
  const contentId=randomUUID(),ideaId=randomUUID(),briefId=randomUUID(),productionId=randomUUID();let reads=0;
  const input:BriefInput={topic:'Original lesson',intendedViewer:'Beginner',learnerLevel:'A1',learningOutcome:'Practice a greeting',platform:'tiktok',targetDurationSeconds:60,primarySuccessMeasure:'Day 7 engagement',nextAction:'Practice aloud',languages:['French'],suggestionId:ideaId,researchIds:[],exampleIds:[contentId],factualSources:[]};
  const original=newBrief(input);original.hooks=[{id:'hook',approach:'useful_result',text:'Original opening',audienceFit:'Beginner practice',evidenceContentIds:[contentId]}];original.selectedHookId='hook';
  original.generation={model:'secret-model',promptVersion:'private-prompt',at:'2026-09-01',stage:'hooks',evidence:{private:'secret-raw-generation'}};
  const revision={id:briefId,kind:'brief',entityKey:briefId,version:2,updatedBy:'owner',updatedAt:'2026-09-01',body:original};
  const link={id:randomUUID(),production_id:productionId,brief_id:briefId,brief_version:2,content_uuid:contentId,asset_version:'export-v3',confirmed_at:'2026-09-08',confirmed_by:'owner'};
  const deps={memory:{
    content:{all:async()=>{reads++;return [{id:contentId,platform:'tiktok',platformVideoId:'native-1',title:'Lesson',format:'lesson',hook:null,hypothesis:null,postedAt:'2026-09-01T12:00:00Z'}];}},
    performance:{all:async()=>[]},contentAnalysis:{all:async()=>[]},
    suggestions:{all:async()=>[{id:ideaId,status:'surfaced',createdAt:'2026-09-01',hypothesis:'practice',payload:{kind:'next_video',theme:'Original idea',evidenceContentIds:[contentId]}}]},
    insightRuns:{latest:async()=>null},hypothesisSuggestions:{all:async()=>[]},
  },store:{list:async(kind:string)=>kind==='brief'?[{...revision,version:3,body:{...original,input:{...input,topic:'Changed current lesson',suggestionId:randomUUID()}}}]:[],allMemories:async()=>[],revision:async(kind:string,id:string,version:number)=>{assert.equal(kind,'brief');assert.equal(id,briefId);assert.equal(version,2);return revision;}},
  lineage:{recent:async()=>[link],forContent:async(id:string)=>{assert.equal(id,contentId);return [link];}},running:()=>false,now:()=> '2026-09-09T12:00:00Z'} as unknown as BrainDependencies;
  const host=new Hono<StudioEnv>();host.use('*',async(c,next)=>{c.set('auth',role?{role,email:'fixture@example.com'}:null);await next();});host.route('/api/brain',createBrainRouter(deps));
  return {host,deps,contentId,ideaId,reads:()=>reads};
}
test('all Brain routes deny anonymous and unrelated roles before any storage access',async()=>{
  for(const [role,status] of [[null,401],['student',403],['salesman',403]] as const){const f=fixture(role);for(const path of ['/api/brain',`/api/brain/journey/${f.contentId}`])assert.equal((await f.host.request(path)).status,status);assert.equal(f.reads(),0);}
});
test('owner and marketing receive an allowlisted read-only overview with honest unmeasured videos',async()=>{
  for(const role of ['owner','marketing']){const f=fixture(role),response=await f.host.request('/api/brain');assert.equal(response.status,200);const body=await response.json() as BrainOverview;
    assert.equal(body.videos!.length,1);assert.equal(body.videos![0]!.outcome,'unmeasured');assert.equal(body.sourceErrors.length,0);
    assert.equal(body.lineage![0]!.suggestionId,f.ideaId,'historical idea, not the changed current brief');
    const text=JSON.stringify(body);for(const secret of ['private-prompt','secret-model','secret-raw-generation','LLM_MONTHLY_CAP','agent_logs','revenueCents'])assert.ok(!text.includes(secret),secret);
  }
});
test('a failed source is null, never an empty-success count, with sanitized error text',async()=>{
  const f=fixture();f.deps.memory.performance.all=async()=>{throw new Error('private-db-key');};
  const body=await (await f.host.request('/api/brain')).json() as BrainOverview;
  assert.equal(body.videos,null);assert.ok(body.sourceErrors.includes('performance'));assert.equal(body.briefs!.length,1);assert.ok(!JSON.stringify(body).includes('private-db-key'));
});
test('unavailable or malformed duration evidence prevents false unknown-duration cohorts',async()=>{
  const f=fixture();f.deps.store.allMemories=async()=>{throw new Error('private');};
  let body=await (await f.host.request('/api/brain')).json() as BrainOverview;assert.equal(body.videos,null);assert.equal(body.memories,null);
  f.deps.store.allMemories=async()=>[{id:f.contentId,kind:'memory',entityKey:f.contentId,version:1,body:{durationSeconds:'bad'},updatedBy:'owner',updatedAt:'2026-09-01'}];
  body=await (await f.host.request('/api/brain')).json() as BrainOverview;assert.equal(body.videos,null);assert.ok(body.sourceErrors.includes('invalid creative memory record'));
});
test('journey dereferences exact historical brief and strips raw generation context',async()=>{
  const f=fixture(),response=await f.host.request(`/api/brain/journey/${f.contentId}`);assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.confirmed[0].brief.topic,'Original lesson');assert.equal(body.confirmed[0].brief.selectedHook,'Original opening');assert.equal(body.confirmed[0].suggestion.id,f.ideaId);
  assert.ok(!JSON.stringify(body).includes('secret-raw-generation'));assert.match(body.notice,/not machine-verified/);
});
test('missing historical revision remains unknown and never borrows a new brief',async()=>{
  const f=fixture();f.deps.store.revision=async()=>null;
  const body=await (await f.host.request(`/api/brain/journey/${f.contentId}`)).json();assert.equal(body.confirmed[0].brief,null);assert.equal(body.confirmed[0].suggestion,null);
  const overview=await (await f.host.request('/api/brain')).json() as BrainOverview;assert.equal(overview.lineage![0]!.suggestionId,null);
});
test('invalid and foreign video identifiers cannot read lineage; storage errors do not leak',async()=>{
  const f=fixture();let lineageReads=0;f.deps.lineage.forContent=async()=>{lineageReads++;throw new Error('connection-secret');};
  assert.equal((await f.host.request('/api/brain/journey/not-a-uuid')).status,400);assert.equal((await f.host.request(`/api/brain/journey/${randomUUID()}`)).status,404);assert.equal(lineageReads,0);
  const response=await f.host.request(`/api/brain/journey/${f.contentId}`);assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'brain_unavailable'});
});
test('overview/journey expose no mutation or generation endpoint',async()=>{
  const f=fixture();for(const method of ['POST','PUT','DELETE']){assert.equal((await f.host.request('/api/brain',{method})).status,404);assert.equal((await f.host.request(`/api/brain/journey/${f.contentId}`,{method})).status,404);}assert.equal(f.reads(),0);
});
test('invalid stored patterns cannot acquire a supported-pattern badge',async()=>{
  const f=fixture();f.deps.memory.insightRuns.latest=async()=>({id:randomUUID(),createdAt:'2026-09-01',status:'numbers_only',report:{perPlatform:[{claims:[{n:2,platform:'tiktok'}]}]}} as never);
  const body=await (await f.host.request('/api/brain')).json() as BrainOverview;assert.deepEqual(body.learnings,[]);assert.ok(body.sourceErrors.includes('invalid stored pattern'));
});
