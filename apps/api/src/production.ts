import { Hono } from 'hono';
import { z } from 'zod';
import { BriefBodySchema, ProductionBodySchema, ProductionStageSchema, editProduction, advanceProduction } from '@platform/shared';
import { SaveEnvelope, type StudioEnv, type StudioDependencies } from './studio.js';
export function createProductionRouter(deps:StudioDependencies):Hono<StudioEnv> {
 const app=new Hono<StudioEnv>();
 const idOf=(id:string)=>z.uuid().parse(id);
 async function approvedBrief(id:string,version:number){const r=await deps.store.revision('brief',id,version);return !!r&&BriefBodySchema.parse(r.body).approval?.version===version;}
 app.get('/',async c=>c.json(await deps.store.list('production')));
 app.get('/:id',async c=>{
  const id=idOf(c.req.param('id')),record=await deps.store.get('production',id);if(!record)return c.json({error:'production_not_found'},404);
  const b=ProductionBodySchema.parse(record.body);
  return c.json({record,history:await deps.store.history('production',id),brief:await deps.store.revision('brief',b.briefId,b.briefVersion),lineage:await deps.store.lineage(id),notice:'Confirmed links are manual declarations. Historical X6 matches remain inferred. Asset identity is supplied by humans, not verified by media processing.'});
 });
 app.put('/:id',async c=>{
  const id=idOf(c.req.param('id')),e=SaveEnvelope.parse(await c.req.json()),old=await deps.store.get('production',id);
  const body=editProduction(e.body,old?ProductionBodySchema.parse(old.body):null);
  const reference=await deps.store.revision('brief',body.briefId,body.briefVersion);
  if(!reference)return c.json({error:'brief_not_found'},404);
  if(body.stage!=='selected'&&!await approvedBrief(body.briefId,body.briefVersion))return c.json({error:'approved_brief_required'},400);
  return c.json(await deps.store.save({id,kind:'production',entityKey:body.briefId,expectedVersion:e.expectedVersion,requestId:e.requestId,body,actor:c.get('auth')!.email}));
 });
 app.post('/:id/advance',async c=>{
  const id=idOf(c.req.param('id')),e=z.object({expectedVersion:z.number().int().positive(),requestId:z.uuid(),stage:ProductionStageSchema,reviewedExactVersion:z.boolean().optional()}).strict().parse(await c.req.json());
  if(e.stage==='approved'&&c.get('auth')!.role!=='owner')return c.json({error:'owner_approval_required'},403);
  if(e.stage==='approved'&&e.reviewedExactVersion!==true)return c.json({error:'explicit_review_required'},400);
  const old=await deps.store.get('production',id);if(!old)return c.json({error:'production_not_found'},404);
  const b=ProductionBodySchema.parse(old.body),auth=c.get('auth')!;
  const body=advanceProduction(b,e.stage,auth.email,auth.role,e.expectedVersion+1,await approvedBrief(b.briefId,b.briefVersion));
  return c.json(await deps.store.save({id,kind:'production',entityKey:body.briefId,expectedVersion:e.expectedVersion,requestId:e.requestId,body,actor:auth.email}));
 });
 app.post('/:id/confirm-posted',async c=>{
  // Owner declares exact approved export -> already ingested video. No publisher.
  if(c.get('auth')!.role!=='owner')return c.json({error:'owner_approval_required'},403);
  const id=idOf(c.req.param('id')),e=z.object({expectedVersion:z.number().int().positive(),requestId:z.uuid(),contentId:z.uuid(),confirmedExactExport:z.literal(true)}).strict().parse(await c.req.json());
  const old=await deps.store.get('production',id);if(!old)return c.json({error:'production_not_found'},404);
  const b=ProductionBodySchema.parse(old.body);
  if(!['approved','posted'].includes(b.stage)||!b.approval)return c.json({error:'exact_approval_required'},400);
  if(!(await deps.memory.content.all()).some(v=>v.id===e.contentId))return c.json({error:'content_not_found'},404);
  return c.json(await deps.store.confirmLineage(id,e.expectedVersion,e.contentId,c.get('auth')!.email,e.requestId));
 });
 return app;
}
