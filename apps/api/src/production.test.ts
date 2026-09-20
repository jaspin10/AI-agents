import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { newBrief,editProduction,emptyChecklist,type StudioRecord } from '@platform/shared';
import { createStudioRouter,type StudioEnv,type StudioDependencies } from './studio.js';
function fixture(role='owner'){
 const id=randomUUID(),briefId=randomUUID(),contentId=randomUUID();let confirmations=0;
 const brief=newBrief({topic:'Greetings',intendedViewer:'A1 learner',learnerLevel:'A1',learningOutcome:'Greet',platform:'instagram',targetDurationSeconds:30,primarySuccessMeasure:'saves',nextAction:'Practise',languages:['French'],suggestionId:null,researchIds:[],exampleIds:[],factualSources:[]});brief.approval={by:'Jas',at:'now',version:4,factualConfirmation:'Reviewed all claims'};
 const body=editProduction({briefId,briefVersion:4,owner:'Jas',dueDate:null,responsibilities:{preparer:'Eknoor',recorder:'Jas',editor:'Loop',reviewer:'Jas'},blockers:[],assets:[{version:'v1',url:'https://example.com/v1',fingerprint:'v1-sha',durationSeconds:30,approvedReference:true}],currentAssetVersion:'v1',requests:[],checklist:emptyChecklist().map(c=>({...c,status:'pass'}))},null);body.stage='edit_review';
 let record:StudioRecord={id,kind:'production',entityKey:briefId,version:1,body,updatedBy:'Jas',updatedAt:'now'};
 const store={get:async(k:string,rid:string)=>k==='production'&&rid===id?structuredClone(record):null,revision:async(k:string,rid:string,v:number)=>k==='brief'&&rid===briefId&&v===4?{...record,id:briefId,kind:'brief',version:4,body:brief}:null,save:async(v:{expectedVersion:number;body:Record<string,unknown>})=>{if(v.expectedVersion!==record.version)throw new Error('version_conflict');record={...record,version:record.version+1,body:v.body};return record;},confirmLineage:async()=>{confirmations++;return record;}} as unknown as StudioDependencies['store'];
 const app=new Hono<StudioEnv>();app.use('*',async(c,next)=>{c.set('auth',{role,email:'test'});await next();});app.route('/api/studio',createStudioRouter({store,memory:{content:{all:async()=>[{id:contentId}]} as StudioDependencies['memory']['content'],suggestions:{all:async()=>[]}}}));
 return {id,contentId,body,confirmations:()=>confirmations,send:(path:string,payload:unknown,method='POST')=>app.request('/api/studio/production/'+path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(payload)})};
}
test('production owner-only approvals and confirmations cannot be forged via edits',async()=>{
 const f=fixture('marketing');assert.equal((await f.send(`${f.id}/advance`,{expectedVersion:1,requestId:randomUUID(),stage:'approved',reviewedExactVersion:true})).status,403);assert.equal((await f.send(`${f.id}/confirm-posted`,{})).status,403);
 assert.equal((await f.send(f.id,{expectedVersion:1,requestId:randomUUID(),body:f.body},'PUT')).status,400);assert.equal(f.confirmations(),0);
});
test('production validates exact review, content existence and record IDs before lineage writes',async()=>{
 const f=fixture(),envelope={expectedVersion:1,requestId:randomUUID(),stage:'approved'};
 assert.equal((await f.send(`${f.id}/advance`,envelope)).status,400);
 assert.equal((await f.send(`${f.id}/advance`,{...envelope,reviewedExactVersion:true})).status,200);
 const e={expectedVersion:2,requestId:randomUUID(),contentId:randomUUID(),confirmedExactExport:true};
 assert.equal((await f.send(`${f.id}/confirm-posted`,e)).status,404);
 assert.equal((await f.send(`${randomUUID()}/confirm-posted`,{...e,contentId:f.contentId})).status,404);
 assert.equal(f.confirmations(),0);assert.equal((await f.send(`${f.id}/confirm-posted`,{...e,contentId:f.contentId})).status,200);assert.equal(f.confirmations(),1);
});
