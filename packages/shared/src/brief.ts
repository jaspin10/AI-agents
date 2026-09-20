import { z } from 'zod';
import { SafeReferenceSchema } from './creative-memory.js';
const short=z.string().trim().min(1).max(2000);
export const BriefInputSchema=z.object({
 topic:short,intendedViewer:short,learnerLevel:short,learningOutcome:short,
 platform:z.string().trim().min(1).max(80),targetDurationSeconds:z.number().int().positive().max(14400),
 primarySuccessMeasure:short,nextAction:short,languages:z.array(z.enum(['Punjabi','English','French'])).min(1).max(3),
 suggestionId:z.uuid().nullable(),researchIds:z.array(z.uuid()).max(20),exampleIds:z.array(z.uuid()).max(12),
 factualSources:z.array(z.object({id:z.uuid(),title:short,text:short,url:SafeReferenceSchema.nullable(),date:z.iso.date()}).strict()).max(10),
}).strict();
export type BriefInput=z.infer<typeof BriefInputSchema>;
export const HookSchema=z.object({id:z.string().min(1).max(80),approach:z.enum(['demonstration_challenge','relatable_problem','useful_result']),text:short,audienceFit:short,evidenceContentIds:z.array(z.uuid()).max(12)}).strict();
export const HooksSchema=z.array(HookSchema).length(3).superRefine((v,c)=>{
 if(new Set(v.map(h=>h.approach)).size!==3 || new Set(v.map(h=>h.id)).size!==3 || new Set(v.map(h=>h.text.trim().toLowerCase())).size!==3)c.addIssue({code:'custom',message:'Three different approaches, IDs and texts required'});
});
export const DraftSchema=z.object({spokenScript:z.string().trim().min(1).max(18000),firstFrameText:short,
 visualBeats:z.array(z.object({atSeconds:z.number().nonnegative(),visual:short,bRoll:z.string().max(2000)}).strict()).min(1).max(40),
 subtitles:short,payoff:short,learnerPractice:short,cta:short,evidenceContentIds:z.array(z.uuid()).max(12),factualSourceIds:z.array(z.uuid()).max(10),
}).strict();
export type BriefDraft=z.infer<typeof DraftSchema>;
export const ReviewChecksSchema=z.object({
 bannedTopics:z.boolean(),brandVoice:z.boolean(),frenchAccuracy:z.boolean(),learnerLevel:z.boolean(),languageFit:z.boolean(),
 noMisleadingPromises:z.boolean(),completeLesson:z.boolean(),learnerPractice:z.boolean(),
 factualRisks:z.array(z.string().max(1000)).max(20),reasons:z.array(z.string().max(1000)).max(40),
}).strict();
export type ReviewChecks=z.infer<typeof ReviewChecksSchema>;
export function checksPassed(c:ReviewChecks|null):boolean {return !!c && c.bannedTopics && c.brandVoice && c.frenchAccuracy && c.learnerLevel && c.languageFit && c.noMisleadingPromises && c.completeLesson && c.learnerPractice;}
export const BriefBodySchema=z.object({
 input:BriefInputSchema,hooks:z.array(HookSchema),hookChecks:ReviewChecksSchema.nullable(),selectedHookId:z.string().nullable(),
 draft:DraftSchema.nullable(),draftChecks:ReviewChecksSchema.nullable(),
 revisionReason:z.string().max(2000),decisions:z.array(z.object({hookId:z.string(),decision:z.enum(['selected','rejected']),reason:short,by:z.string(),at:z.string()})).max(300),
 approval:z.object({by:z.string(),at:z.string(),version:z.number().int().positive(),factualConfirmation:short}).nullable(),
 generation:z.object({model:z.string(),promptVersion:z.string(),at:z.string(),stage:z.enum(['hooks','draft','checks']),evidence:z.record(z.string(),z.unknown())}).nullable(),
}).strict();
export type BriefBody=z.infer<typeof BriefBodySchema>;
export function newBrief(input:BriefInput):BriefBody{return {input,hooks:[],hookChecks:null,selectedHookId:null,draft:null,draftChecks:null,revisionReason:'Initial brief',decisions:[],approval:null,generation:null};}
export function validateDraftReferences(draft:BriefDraft,input:BriefInput):void {
 if(draft.evidenceContentIds.some(id=>!input.exampleIds.includes(id)) || draft.factualSourceIds.some(id=>!input.factualSources.some(s=>s.id===id)))throw new Error('invalid_evidence_reference');
 if(draft.visualBeats.some(b=>b.atSeconds>input.targetDurationSeconds))throw new Error('beat_outside_duration');
}
export function editBrief(old:BriefBody,input:BriefInput,draft:BriefDraft|null,reason:string):BriefBody {
 if(JSON.stringify(input)!==JSON.stringify(old.input))return {...newBrief(input),revisionReason:reason,decisions:old.decisions};
 if(draft && !old.selectedHookId)throw new Error('select_hook_first');
 if(draft)validateDraftReferences(draft,input);
 return {...old,draft,draftChecks:null,approval:null,revisionReason:reason};
}
export function approveBrief(body:BriefBody,actor:string,role:string,version:number,confirmation:string):BriefBody {
 if(role!=='owner')throw new Error('owner_approval_required');
 if(!body.selectedHookId||!body.draft||!checksPassed(body.hookChecks)||!checksPassed(body.draftChecks))throw new Error('review_checks_required');
 if(confirmation.trim().length<10)throw new Error('factual_confirmation_required');
 return {...body,approval:{by:actor,at:new Date().toISOString(),version,factualConfirmation:confirmation},revisionReason:'Human approval of this exact brief revision'};
}
