import { z } from 'zod';
import { SafeReferenceSchema, type StudioRecord } from './creative-memory.js';
const note=z.string().trim().max(2000);
export const ResearchSchema=z.object({
 text:note.min(1), theme:z.string().trim().min(1).max(120),
 category:z.enum(['learning','purchase','reaction','spam']),
 sourceType:z.enum(['public_comment','learner_question','redacted_objection','public_reference','creative_exploration']),
 sourceUrl:SafeReferenceSchema.nullable(), sourceDate:z.iso.date().nullable(), context:note,
 approvedRedacted:z.literal(true), audienceRelevance:note, teachingUsefulness:note,
 productionEffort:z.enum(['small','medium','large','unknown']), recentCoverage:note,
 archived:z.boolean(),
}).strict().superRefine((v,ctx)=>{
 if(v.sourceType==='redacted_objection' && v.sourceUrl!==null)ctx.addIssue({code:'custom',path:['sourceUrl'],message:'Do not link private conversations'});
 if(v.sourceType!=='creative_exploration' && !v.sourceDate)ctx.addIssue({code:'custom',path:['sourceDate'],message:'Source date required'});
 if(['public_comment','public_reference'].includes(v.sourceType) && !v.sourceUrl)ctx.addIssue({code:'custom',path:['sourceUrl'],message:'Approved public reference required'});
 // Defense in depth, not a substitute for human redaction. Never store lead identities.
 const prose=[v.text,v.context,v.theme,v.audienceRelevance,v.teachingUsefulness,v.recentCoverage].join(' ');
 if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(prose)||/\+?\d[\d ()-]{8,}\d/.test(prose))ctx.addIssue({code:'custom',message:'Remove contact details; submit an anonymous approved theme'});
});
export type Research=z.infer<typeof ResearchSchema>;
export function researchKey(text:string):string { return text.normalize('NFKC').toLocaleLowerCase('en').replace(/[\p{P}\p{S}]/gu,' ').replace(/\s+/g,' ').trim(); }
export function topicOpportunities(records:StudioRecord[]) {
 const groups=new Map<string,{theme:string;evidenceIds:string[];verifiedOccurrences:number;referenceIds:string[];reasons:string[];mode:'evidence_backed'|'creative_exploration'}>();
 const seen=new Set<string>();
 for(const r of records){const p=ResearchSchema.safeParse(r.body);if(!p.success)continue;const v=p.data;if(v.archived||v.category==='spam'||v.category==='reaction')continue;
  const dedup=researchKey(v.text);if(seen.has(dedup))continue;seen.add(dedup);
  const key=researchKey(v.theme);const g=groups.get(key)??{theme:v.theme,evidenceIds:[],verifiedOccurrences:0,referenceIds:[],reasons:[],mode:'creative_exploration' as const};
  g.evidenceIds.push(r.id);
  if(v.sourceType==='public_reference')g.referenceIds.push(r.id);
  else if(v.sourceType!=='creative_exploration') {g.verifiedOccurrences++;g.mode='evidence_backed';}
  g.reasons.push(`Audience relevance: ${v.audienceRelevance||'not assessed'}; teaching usefulness: ${v.teachingUsefulness||'not assessed'}; effort: ${v.productionEffort}; recent coverage: ${v.recentCoverage||'not reviewed'}`);
  groups.set(key,g);
 }
 return [...groups.values()].sort((a,b)=>b.verifiedOccurrences-a.verifiedOccurrences||a.theme.localeCompare(b.theme));
}
