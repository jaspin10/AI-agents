import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { newBrief,type StudioRecord,type ReviewChecks } from '@platform/shared';
import type { StudioStore } from '@platform/memory';
import { createStudioRouter,type StudioEnv,type StudioDependencies } from './studio.js';
const baseInput={topic:'Greetings',intendedViewer:'Beginner',learnerLevel:'A1',learningOutcome:'Say hello',platform:'instagram',targetDurationSeconds:30,primarySuccessMeasure:'saves',nextAction:'Practise',languages:['French' as const],suggestionId:null,researchIds:[],exampleIds:[],factualSources:[]};
const checks:ReviewChecks={bannedTopics:true,brandVoice:true,frenchAccuracy:true,learnerLevel:true,languageFit:true,noMisleadingPromises:true,completeLesson:true,learnerPractice:true,factualRisks:[],reasons:[]};
function fixture(role='owner'){
 const records=new Map<string,StudioRecord>(),jobs=new Map<string,{id:string;recordId:string;stage:string;status:string;createdAt:string}>();let calls=0;
 const store:StudioStore={allMemories:async()=>[],revision:async()=>null,lineage:async()=>[],confirmLineage:async()=>{throw new Error("unused");},get:async(k,id)=>{const r=records.get(id);return r?.kind===k?structuredClone(r):null;},list:async k=>[...records.values()].filter(r=>r.kind===k),history:async()=>[],
 save:async v=>{const old=records.get(v.id);if((old?.version??0)!==v.expectedVersion)throw new Error('version_conflict');const r={id:v.id,kind:v.kind,entityKey:v.entityKey,version:v.expectedVersion+1,body:v.body,updatedBy:v.actor,updatedAt:new Date().toISOString()};records.set(v.id,structuredClone(r));return r;},
 claimJob:async(id,recordId,stage)=>{if(jobs.has(id)||[...jobs.values()].some(j=>j.recordId===recordId&&j.status==='running'))throw new Error('generation_already_requested');jobs.set(id,{id,recordId,stage,status:'running',createdAt:new Date().toISOString()});},finishJob:async(id,status)=>{jobs.get(id)!.status=status;},jobs:async id=>[...jobs.values()].filter(j=>j.recordId===id)};
 const deps:StudioDependencies={store,memory:{content:{all:async()=>[]} as StudioDependencies['memory']['content'],suggestions:{all:async()=>[]} as StudioDependencies['memory']['suggestions']},generate:async()=>{calls++;return {hooks:['demonstration_challenge','relatable_problem','useful_result'].map((approach,i)=>({id:String(i),approach:approach as 'useful_result',text:`hook ${i}`,audienceFit:'Beginner',evidenceContentIds:[]})),draft:null,checks,model:'mock',promptVersion:'test'};}};
 const app=new Hono<StudioEnv>();app.use('*',async(c,next)=>{c.set('auth',{role,email:'tester'});await next();});app.route('/api/studio',createStudioRouter(deps));
 return {records,app,calls:()=>calls,send:(path:string,body:unknown,method='POST')=>app.request('/api/studio'+path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)})};
}
test('generation replay and stale versions cannot charge twice; select-hook is human only',async()=>{
 const f=fixture(),id=randomUUID();let r=await f.send(`/briefs/${id}`,{expectedVersion:0,requestId:randomUUID(),body:{input:baseInput,draft:null,revisionReason:'Initial'}},'PUT');assert.equal(r.status,200);
 const requestId=randomUUID();r=await f.send(`/briefs/${id}/generate`,{expectedVersion:1,requestId,stage:'hooks'});assert.equal(r.status,200);assert.equal(f.calls(),1);assert.equal(f.records.get(id)?.body['selectedHookId'],null);
 assert.equal((await f.send(`/briefs/${id}/generate`,{expectedVersion:2,requestId,stage:'hooks'})).status,409);assert.equal(f.calls(),1);
 assert.equal((await f.send(`/briefs/${id}/generate`,{expectedVersion:2,requestId:randomUUID(),stage:'draft'})).status,400);
 assert.equal((await f.send(`/briefs/${id}/select-hook`,{expectedVersion:2,requestId:randomUUID(),hookId:'0',reason:'A clear demonstration fits'})).status,200);
});
test('marketing cannot approve; cannot forge approval through editable body; foreign evidence rejected',async()=>{
 const f=fixture('marketing'),id=randomUUID();
 assert.equal((await f.send(`/briefs/${id}/approve`,{})).status,403);
 assert.equal((await f.send(`/briefs/${id}`,{expectedVersion:0,requestId:randomUUID(),body:{input:baseInput,draft:null,revisionReason:'x',approval:{by:'owner'}}},'PUT')).status,400);
 assert.equal((await f.send(`/briefs/${id}`,{expectedVersion:0,requestId:randomUUID(),body:{input:{...baseInput,exampleIds:[randomUUID()]},draft:null,revisionReason:'x'}},'PUT')).status,400);
});
