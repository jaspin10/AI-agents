import { z } from 'zod';
import { SafeReferenceSchema } from './creative-memory.js';
const text=z.string().trim().min(1).max(2000);
export const ProductionStageSchema=z.enum(['selected','brief_approved','filmed','edit_review','approved','posted','reviewed']);
export const checklistKeys=['speech','musicMasking','frenchSubtitles','safeText','readability','hookPayoff','repetition','rightsConsent','factualAccuracy','cta'] as const;
export const AssetSchema=z.object({version:z.string().trim().min(1).max(100),url:SafeReferenceSchema,fingerprint:text,durationSeconds:z.number().positive().max(14400),approvedReference:z.literal(true)}).strict();
const RequestSchema=z.object({id:z.uuid(),assetVersion:z.string().min(1),atSeconds:z.number().nonnegative().nullable(),type:z.enum(['defect','editorial_suggestion']),text,status:z.enum(['open','resolved']),resolution:z.string().max(2000)}).strict();
export const ChecklistSchema=z.array(z.object({key:z.enum(checklistKeys),status:z.enum(['pending','pass','not_applicable']),note:z.string().max(2000)}).strict()).length(checklistKeys.length).refine(v=>new Set(v.map(x=>x.key)).size===checklistKeys.length,'Each checklist item is required');
export const ProductionEditSchema=z.object({briefId:z.uuid(),briefVersion:z.number().int().positive(),owner:text,dueDate:z.iso.date().nullable(),responsibilities:z.object({preparer:text,recorder:text,editor:text,reviewer:text}).strict(),blockers:z.array(text).max(30),assets:z.array(AssetSchema).max(50),currentAssetVersion:z.string().nullable(),requests:z.array(RequestSchema).max(100),checklist:ChecklistSchema}).strict();
export type ProductionEdit=z.infer<typeof ProductionEditSchema>;
export const ProductionBodySchema=ProductionEditSchema.extend({stage:ProductionStageSchema,approval:z.object({by:text,at:z.string(),recordVersion:z.number().int().positive(),assetVersion:text,fingerprint:text,briefId:z.uuid(),briefVersion:z.number().int().positive()}).nullable()}).strict();
export type ProductionBody=z.infer<typeof ProductionBodySchema>;
export function emptyChecklist():ProductionEdit['checklist']{return checklistKeys.map(key=>({key,status:'pending',note:''}));}
export function editProduction(input:unknown,old:ProductionBody|null):ProductionBody {
 const v=ProductionEditSchema.parse(input);
 if(new Set(v.assets.map(a=>a.version)).size!==v.assets.length)throw new Error('asset_version_duplicate');
 if(v.currentAssetVersion && !v.assets.some(a=>a.version===v.currentAssetVersion))throw new Error('asset_required');
 for(const r of v.requests){const asset=v.assets.find(a=>a.version===r.assetVersion);if(!asset||r.atSeconds!==null&&r.atSeconds>asset.durationSeconds||r.status==='resolved'&&!r.resolution.trim())throw new Error('invalid_revision_request');}
 if(new Set(v.requests.map(r=>r.id)).size!==v.requests.length)throw new Error('invalid_revision_request');
 if(old){
  if(v.briefId!==old.briefId||v.briefVersion!==old.briefVersion&&old.stage!=='selected')throw new Error('brief_version_locked');
  for(const a of old.assets)if(JSON.stringify(v.assets.find(x=>x.version===a.version))!==JSON.stringify(a))throw new Error('asset_version_immutable');
  for(const r of old.requests)if(!v.requests.some(x=>x.id===r.id))throw new Error('revision_history_required');
  if(['posted','reviewed'].includes(old.stage))throw new Error('posted_item_locked');
 }
 const assetChanged=!!old&&old.currentAssetVersion!==v.currentAssetVersion;
 const briefChanged=!!old&&old.briefVersion!==v.briefVersion;
 return {...v,checklist:assetChanged||briefChanged?emptyChecklist():v.checklist,stage:old?.stage==='approved'||assetChanged&&['filmed','edit_review'].includes(old?.stage??'')?'edit_review':old?.stage??'selected',approval:null};
}
export function advanceProduction(body:ProductionBody,target:ProductionBody['stage'],actor:string,role:string,version:number,briefApproved:boolean):ProductionBody {
 const allowed:Partial<Record<ProductionBody['stage'],ProductionBody['stage']>>={selected:'brief_approved',brief_approved:'filmed',filmed:'edit_review',edit_review:'approved',posted:'reviewed'};
 if(allowed[body.stage]!==target)throw new Error('invalid_stage_transition');
 if(!briefApproved)throw new Error('approved_brief_required');
 if(body.blockers.length)throw new Error('unresolved_blockers');
 const asset=body.assets.find(a=>a.version===body.currentAssetVersion);
 if(['edit_review','approved'].includes(target)&&!asset)throw new Error('asset_required');
 if(target==='approved'){
  if(role!=='owner')throw new Error('owner_approval_required');
  if(body.requests.some(r=>r.status==='open'))throw new Error('unresolved_revisions');
  if(body.checklist.some(c=>c.status==='pending'||c.status==='not_applicable'&&(!c.note.trim()||['rightsConsent','factualAccuracy'].includes(c.key))))throw new Error('production_checks_required');
  return {...body,stage:target,approval:{by:actor,at:new Date().toISOString(),recordVersion:version,assetVersion:asset!.version,fingerprint:asset!.fingerprint,briefId:body.briefId,briefVersion:body.briefVersion}};
 }
 return {...body,stage:target};
}
