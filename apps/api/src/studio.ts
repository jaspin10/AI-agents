import { randomUUID, createHash } from 'node:crypto';
import { bodyLimit } from 'hono/body-limit';
import { Hono } from 'hono';
import { z } from 'zod';
import { prepareCreativeMemory, ResearchSchema, researchKey, topicOpportunities, type CreativeMemory, BriefInputSchema, BriefBodySchema, DraftSchema, newBrief, editBrief, approveBrief, checksPassed, type BriefBody, type ReviewChecks } from '@platform/shared';
import type { StudioStore, MemoryClient } from '@platform/memory';
export type StudioEnv={Variables:{auth:{role:string;email:string}|null}};
export const SaveEnvelope=z.object({expectedVersion:z.number().int().nonnegative(),requestId:z.uuid(),body:z.unknown()}).strict();
export interface StudioDependencies { store:StudioStore; memory:{content:Pick<MemoryClient['content'],'all'>;suggestions:Pick<MemoryClient['suggestions'],'all'>};
 generate?:(stage:'hooks'|'draft'|'checks',body:BriefBody,evidence:Record<string,unknown>,actor:string,runId:string)=>Promise<{hooks:BriefBody['hooks'];draft:BriefBody['draft'];checks:ReviewChecks;model:string;promptVersion:string}>;
}
export function createStudioRouter(deps:StudioDependencies):Hono<StudioEnv> {
 const app=new Hono<StudioEnv>();
 app.use('*',async(c,next)=>{
  const auth=c.get('auth'); if(!auth)return c.json({error:'unauthorized'},401);
  if(!['owner','marketing'].includes(auth.role))return c.json({error:'forbidden'},403);
  // Same-site cookie auth: reject browser cross-site writes. No origin trust in body.
  if(!['GET','HEAD'].includes(c.req.method)) {
   if(c.req.header('sec-fetch-site')==='cross-site')return c.json({error:'cross_site_write'},403);
   if(!(c.req.header('content-type')??'').startsWith('application/json'))return c.json({error:'json_required'},415);
   if(Number(c.req.header('content-length')??0)>150000)return c.json({error:'body_too_large'},413);
  }
  await next();
 });
 app.use('*',bodyLimit({maxSize:150000,onError:c=>c.json({error:'body_too_large'},413)}));
 app.onError((e,c)=>{
  if(e instanceof z.ZodError)return c.json({error:'invalid_body',issues:e.issues.map(i=>({path:i.path,message:i.message}))},400);
  if(['version_conflict','request_conflict','duplicate_evidence','generation_already_requested'].includes(e.message))return c.json({error:e.message},409);
  if(['select_hook_first','draft_required','invalid_evidence_reference','review_checks_required','factual_confirmation_required','beat_outside_duration'].includes(e.message))return c.json({error:e.message},400);
  return c.json({error:'studio_unavailable'},503);
 });
 app.get('/memory/:id',async c=>{
  const id=z.uuid().parse(c.req.param('id'));const content=(await deps.memory.content.all()).find(v=>v.id===id);
  if(!content)return c.json({error:'content_not_found'},404);
  return c.json({record:await deps.store.get('memory',id),history:await deps.store.history('memory',id)});
 });
 app.put('/memory/:id',async c=>{
  const id=z.uuid().parse(c.req.param('id'));const {body,expectedVersion,requestId}=SaveEnvelope.parse(await c.req.json());
  if(!(await deps.memory.content.all()).some(v=>v.id===id))return c.json({error:'content_not_found'},404);
  const old=await deps.store.get('memory',id);
  const value=prepareCreativeMemory(body,old?old.body as CreativeMemory:null);
  return c.json(await deps.store.save({id,kind:'memory',entityKey:id,expectedVersion,requestId,body:value,actor:c.get('auth')!.email}));
 });
 app.get('/research',async c=>{
  const records=await deps.store.list('research');return c.json({records,topics:topicOpportunities(records),notice:'Latest 500 records; counts are distinct approved entries in this inbox, not all audience demand.'});
 });
 app.put('/research/:id',async c=>{
  const id=z.uuid().parse(c.req.param('id'));const {body,expectedVersion,requestId}=SaveEnvelope.parse(await c.req.json());
  const value=ResearchSchema.parse(body);const key=createHash('sha256').update(researchKey(value.text)).digest('hex');

  const duplicate=(await deps.store.list('research')).find(r=>r.id!==id && researchKey(String(r.body['text']))===researchKey(value.text));
  if(duplicate)return c.json({error:'duplicate_evidence',existingId:duplicate.id},409);
  return c.json(await deps.store.save({id,kind:'research',entityKey:key,expectedVersion,requestId,body:value,actor:c.get('auth')!.email}));
 });

 async function validateBriefInput(input:BriefBody['input']) {
  const contents=await deps.memory.content.all();
  if(input.exampleIds.some(id=>!contents.some(v=>v.id===id)))throw new Error('invalid_evidence_reference');
  if(input.suggestionId && !(await deps.memory.suggestions.all()).some(s=>s.id===input.suggestionId && ['surfaced','posted'].includes(s.status)))throw new Error('invalid_evidence_reference');
  for(const id of input.researchIds){const r=await deps.store.get('research',id);if(!r||r.body['archived']||['spam','reaction'].includes(String(r.body['category'])))throw new Error('invalid_evidence_reference');}
 }
 async function briefEvidence(body:BriefBody):Promise<Record<string,unknown>> {
  await validateBriefInput(body.input);
  const contents=await deps.memory.content.all();
  const examples=[];
  for(const id of body.input.exampleIds){const r=await deps.store.get('memory',id);const m=r?.body;
   examples.push({content:contents.find(v=>v.id===id),memoryVersion:r?.version??null,
    descriptive:m?Object.fromEntries(Object.entries(m).filter(([k])=>!['asset','annotations','contributors'].includes(k))):null,
    observations:m?((m['annotations']??[]) as Array<Record<string,unknown>>).filter(a=>a['review']==='reviewed'):[],
    notice:'Manual annotations only; absence is not a transcript. Examples may be non-examples; no causal performance promise.'});
  }
  const research=[];for(const id of body.input.researchIds){const r=await deps.store.get('research',id);research.push({id,version:r!.version,body:r!.body});}
  const suggestion=body.input.suggestionId?(await deps.memory.suggestions.all()).find(s=>s.id===body.input.suggestionId):null;
  return {examples,research,suggestion:suggestion?{id:suggestion.id,payload:suggestion.payload}:null,caution:'Observed patterns are hypotheses, not causation. Missing metrics/transcripts stay missing; no guaranteed views. Sources supplied by humans require dated factual review.'};
 }
 app.get('/briefs',async c=>c.json(await deps.store.list('brief')));
 app.get('/briefs/:id',async c=>{
  const id=z.uuid().parse(c.req.param('id'));const record=await deps.store.get('brief',id);if(!record)return c.json({error:'brief_not_found'},404);
  return c.json({record,history:await deps.store.history('brief',id),jobs:await deps.store.jobs(id)});
 });
 app.put('/briefs/:id',async c=>{
  const id=z.uuid().parse(c.req.param('id'));const e=SaveEnvelope.parse(await c.req.json());
  const v=z.object({input:BriefInputSchema,draft:DraftSchema.nullable(),revisionReason:z.string().trim().min(1).max(2000)}).strict().parse(e.body);
  await validateBriefInput(v.input);const old=await deps.store.get('brief',id);
  if(!old && v.draft)throw new Error('select_hook_first');
  const body=old?editBrief(BriefBodySchema.parse(old.body),v.input,v.draft,v.revisionReason):newBrief(v.input);
  return c.json(await deps.store.save({id,kind:'brief',entityKey:id,expectedVersion:e.expectedVersion,requestId:e.requestId,body,actor:c.get('auth')!.email}));
 });
 app.post('/briefs/:id/select-hook',async c=>{
  const id=z.uuid().parse(c.req.param('id'));const e=z.object({expectedVersion:z.number().int().positive(),requestId:z.uuid(),hookId:z.string(),reason:z.string().trim().min(1).max(2000)}).strict().parse(await c.req.json());
  const old=await deps.store.get('brief',id);if(!old)return c.json({error:'brief_not_found'},404);const body=BriefBodySchema.parse(old.body);
  if(!checksPassed(body.hookChecks)||!body.hooks.some(h=>h.id===e.hookId))throw new Error('review_checks_required');
  const actor=c.get('auth')!.email;body.selectedHookId=e.hookId;body.draft=null;body.draftChecks=null;body.approval=null;
  body.decisions.push(...body.hooks.map(h=>({hookId:h.id,decision:h.id===e.hookId?'selected' as const:'rejected' as const,reason:e.reason,by:actor,at:new Date().toISOString()})));
  return c.json(await deps.store.save({id,kind:'brief',entityKey:id,expectedVersion:e.expectedVersion,requestId:e.requestId,body:BriefBodySchema.parse(body),actor}));
 });
 app.post('/briefs/:id/generate',async c=>{
  const id=z.uuid().parse(c.req.param('id'));const e=z.object({expectedVersion:z.number().int().positive(),requestId:z.uuid(),stage:z.enum(['hooks','draft','checks'])}).strict().parse(await c.req.json());
  const old=await deps.store.get('brief',id);if(!old)return c.json({error:'brief_not_found'},404);if(old.version!==e.expectedVersion)throw new Error('version_conflict');
  const body=BriefBodySchema.parse(old.body);
  if(e.stage!=='hooks' && (!body.selectedHookId||!checksPassed(body.hookChecks)))throw new Error('select_hook_first');
  if(!deps.generate)return c.json({error:'generation_unavailable'},503);
  const evidence=await briefEvidence(body),actor=c.get('auth')!.email;
  await deps.store.claimJob(e.requestId,id,e.stage,actor);
  try {
   const generated=await deps.generate(e.stage,body,evidence,actor,e.requestId);
   if((await deps.store.jobs(id)).find(j=>j.id===e.requestId)?.status!=='running')throw new Error('generation_cancelled');
   const next:BriefBody={...body,approval:null,generation:{model:generated.model,promptVersion:generated.promptVersion,at:new Date().toISOString(),stage:e.stage,evidence}};
   if(e.stage==='hooks'){next.hooks=generated.hooks;next.hookChecks=generated.checks;next.selectedHookId=null;next.draft=null;next.draftChecks=null;}
   else {next.draft=generated.draft;next.draftChecks=generated.checks;}
   next.revisionReason=`AI ${e.stage}; human review required`;
   const saved=await deps.store.save({id,kind:'brief',entityKey:id,expectedVersion:old.version,requestId:randomUUID(),body:BriefBodySchema.parse(next),actor});
   await deps.store.finishJob(e.requestId,'complete');return c.json(saved);
  } catch(error){await deps.store.finishJob(e.requestId,'failed');throw error;}
 });
 app.post('/briefs/:id/cancel-job',async c=>{
  if(c.get('auth')!.role!=='owner')return c.json({error:'owner_approval_required'},403);
  const id=z.uuid().parse(c.req.param('id'));const {jobId}=z.object({jobId:z.uuid()}).strict().parse(await c.req.json());
  if(!(await deps.store.jobs(id)).some(j=>j.id===jobId))return c.json({error:'job_not_found'},404);
  await deps.store.finishJob(jobId,'failed');return c.json({ok:true});
 });
 app.post('/briefs/:id/approve',async c=>{
  if(c.get('auth')!.role!=='owner')return c.json({error:'owner_approval_required'},403);
  const id=z.uuid().parse(c.req.param('id'));const e=z.object({expectedVersion:z.number().int().positive(),requestId:z.uuid(),factualConfirmation:z.string().min(10).max(2000),reviewedFrench:z.literal(true),reviewedLevel:z.literal(true),reviewedTeaching:z.literal(true),reviewedFacts:z.literal(true)}).strict().parse(await c.req.json());
  const old=await deps.store.get('brief',id);if(!old)return c.json({error:'brief_not_found'},404);
  const body=approveBrief(BriefBodySchema.parse(old.body),c.get('auth')!.email,c.get('auth')!.role,e.expectedVersion+1,e.factualConfirmation);
  return c.json(await deps.store.save({id,kind:'brief',entityKey:id,expectedVersion:e.expectedVersion,requestId:e.requestId,body,actor:c.get('auth')!.email}));
 });
 return app;
}
