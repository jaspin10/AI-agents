import { createHash } from 'node:crypto';
import { bodyLimit } from 'hono/body-limit';
import { Hono } from 'hono';
import { z } from 'zod';
import { prepareCreativeMemory, ResearchSchema, researchKey, topicOpportunities, type CreativeMemory } from '@platform/shared';
import type { StudioStore, MemoryClient } from '@platform/memory';
export type StudioEnv={Variables:{auth:{role:string;email:string}|null}};
export const SaveEnvelope=z.object({expectedVersion:z.number().int().nonnegative(),requestId:z.uuid(),body:z.unknown()}).strict();
export interface StudioDependencies { store:StudioStore; memory:Pick<MemoryClient,'content'> }
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
  if(['version_conflict','request_conflict','duplicate_evidence'].includes(e.message))return c.json({error:e.message},409);
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
 return app;
}
