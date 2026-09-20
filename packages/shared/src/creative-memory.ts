import { z } from 'zod';
export const SafeReferenceSchema = z.string().max(2000).url().refine(v => {
 const u=new URL(v); return u.protocol==='https:' && !u.username && !u.password;
}, 'Use an approved HTTPS reference without credentials');
const text = z.string().trim().max(2000);
export const CreativeMemorySchema = z.object({
 audience: text, learnerLevel: text, topic: text, purpose: text,
 languageMix: z.array(z.string().trim().min(1).max(80)).max(8),
 durationSeconds: z.number().positive().max(14400).nullable(), openingLine: text,
 firstPayoffSeconds: z.number().nonnegative().nullable(), ctaSeconds: z.number().nonnegative().nullable(),
 asset: z.object({ url: SafeReferenceSchema, version: z.string().trim().min(1).max(100), fingerprint: z.string().trim().min(1).max(200), approvedReference: z.literal(true) }).strict().nullable(),
 contributors: z.object({ writer: text, filmer: text, editor: text }).strict(),
 classification: z.object({ value: z.enum(['uncertain','short','long']), source: text, reviewed: z.boolean() }).strict(),
 annotations: z.array(z.object({
  id: z.uuid(), kind: z.enum(['transcript','scene','hook','payoff','cta','other']),
  startSeconds: z.number().nonnegative(), endSeconds: z.number().nonnegative(), text: text.min(1),
  confidence: z.enum(['observed','uncertain']), review: z.enum(['draft','reviewed']),
 }).strict()).max(200),
}).strict().superRefine((v,ctx)=> {
 if(v.classification.value!=='uncertain' && (!v.classification.reviewed || !v.classification.source)) ctx.addIssue({code:'custom',message:'Classification requires reviewed source',path:['classification']});
 const ids=new Set<string>();
 for(const [i,a] of v.annotations.entries()) {
  if(ids.has(a.id)) ctx.addIssue({code:'custom',message:'Duplicate annotation ID',path:['annotations',i]}); ids.add(a.id);
  if(!v.asset || a.endSeconds<a.startSeconds || (v.durationSeconds!==null && a.endSeconds>v.durationSeconds)) ctx.addIssue({code:'custom',message:'Annotation needs an asset and valid source timestamps',path:['annotations',i]});
 }
 for(const key of ['firstPayoffSeconds','ctaSeconds'] as const) if(v[key]!==null && v.durationSeconds!==null && v[key]!>v.durationSeconds) ctx.addIssue({code:'custom',message:'Timestamp exceeds duration',path:[key]});
});
export type CreativeMemory = z.infer<typeof CreativeMemorySchema>;
export function prepareCreativeMemory(input: unknown, previous: CreativeMemory | null): CreativeMemory {
 const value=CreativeMemorySchema.parse(input);
 if(previous && JSON.stringify(value.asset)!==JSON.stringify(previous.asset)) {
  value.annotations=value.annotations.map(a=>({...a,review:'draft'}));
 }
 return value;
}
export function annotationLink(asset: NonNullable<CreativeMemory['asset']>, seconds: number): string {
 const url=new URL(asset.url);url.hash=`t=${seconds}`;return url.toString();
}

export const StudioRecordSchema=z.object({id:z.uuid(),kind:z.string(),entityKey:z.string(),version:z.number().int().positive(),body:z.record(z.string(),z.unknown()),updatedBy:z.string(),updatedAt:z.string()});
export type StudioRecord=z.infer<typeof StudioRecordSchema>;
