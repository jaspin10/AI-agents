import { generateBrief, type BriefStage } from '@platform/agent-analyst';
import { createReservedLlm, createMemoryClient, createLogStore } from '@platform/memory';
import type { BriefBody } from '@platform/shared';
export async function runBriefGeneration(stage:BriefStage,body:BriefBody,evidence:Record<string,unknown>,actor:string,runId:string){
 const startedAt=new Date().toISOString(),log=createLogStore();
 const llm=createReservedLlm(runId,'analyst-brief');if(!llm)throw new Error('LLM key or positive budget unavailable');
 try {
  const brand=await createMemoryClient().brandAssets.allChunks('brand-voice.md');
  const result=await generateBrief(stage,body,evidence,llm,brand);
  await log.append({runId,taskId:null,agent:'analyst-brief',tool:'brief.reviewed-draft',status:'ok',input:{stage,actor},output:{model:result.model,promptVersion:result.promptVersion,checks:result.checks},error:null,startedAt,finishedAt:new Date().toISOString()});return result;
 }catch(error){
  await log.append({runId,taskId:null,agent:'analyst-brief',tool:'brief.reviewed-draft',status:'error',input:{stage,actor},output:null,error:'Draft generation/checking unavailable; no approval granted',startedAt,finishedAt:new Date().toISOString()});throw error;
 }
}
