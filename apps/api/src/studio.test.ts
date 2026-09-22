import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { createStudioRouter, type StudioEnv, type StudioDependencies } from './studio.js';
import { newBrief } from '@platform/shared';
const id=randomUUID();
function app(role:string|null, exists=true){
 let reads=0;
 const host=new Hono<StudioEnv>();host.use('*',async(c,next)=>{c.set('auth',role?{role,email:'test@example.com'}:null);await next();});
 const deps={store:{get:async()=>{reads++;return null;},history:async()=>[]},memory:{content:{all:async()=>exists?[{id}]:[]}}} as unknown as StudioDependencies;
 host.route('/api/studio',createStudioRouter(deps));return {host,reads:()=>reads};
}
test('anonymous and non-marketing roles cannot reach studio data',async()=>{for(const [role,status] of [[null,401],['salesman',403],['student',403]] as const){const a=app(role);assert.equal((await a.host.request(`/api/studio/memory/${id}`)).status,status);assert.equal(a.reads(),0);}});
test('owner/marketing access valid content; foreign ids do not expose records',async()=>{for(const role of ['owner','marketing']){assert.equal((await app(role).host.request(`/api/studio/memory/${id}`)).status,200);}const a=app('owner',false);assert.equal((await a.host.request(`/api/studio/memory/${id}`)).status,404);assert.equal(a.reads(),0);});
test('cross-site write is denied before parsing or storage',async()=>{assert.equal((await app('owner').host.request(`/api/studio/memory/${id}`,{method:'PUT',headers:{'sec-fetch-site':'cross-site','content-type':'application/json'},body:'{}'})).status,403);});

test('generation failure returns safe actionable diagnostics and never saves or approves',async()=>{
 for(const cleanupFails of [false,true]){
  let saved=0,finished=0;
  const host=new Hono<StudioEnv>();host.use('*',async(c,next)=>{c.set('auth',{role:'marketing',email:'test@example.com'});await next();});
  const body=newBrief({topic:'Greeting',intendedViewer:'Beginner',learnerLevel:'A1',learningOutcome:'Say hello',platform:'instagram',targetDurationSeconds:30,primarySuccessMeasure:'saves',nextAction:'Try it',languages:['French'],suggestionId:null,researchIds:[],exampleIds:[],factualSources:[]});
  const deps={store:{get:async()=>({id,version:1,body}),claimJob:async()=>{},finishJob:async()=>{finished++;if(cleanupFails)throw Error('private db error');},save:async()=>{saved++;}},memory:{content:{all:async()=>[]},suggestions:{all:async()=>[]}},generate:async()=>{throw new SyntaxError('private generated output');}} as unknown as StudioDependencies;
  host.route('/api/studio',createStudioRouter(deps));const requestId=randomUUID();
  const r=await host.request(`/api/studio/briefs/${id}/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expectedVersion:1,requestId,stage:'hooks'})});
  assert.equal(r.status,503);const data=await r.json();assert.equal(data.error,'generation_invalid_output');assert.equal(data.requestId,requestId);assert.match(data.message,/No new revision/);assert.doesNotMatch(JSON.stringify(data),/private/);assert.equal(saved,0);assert.equal(finished,1);assert.equal(body.approval,null);
 }
});
