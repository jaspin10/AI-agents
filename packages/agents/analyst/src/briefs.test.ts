import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBrief,type BrandAssetChunk,type LlmClient } from '@platform/shared';
import { generateBrief } from './briefs.js';
const b=newBrief({topic:'Greeting',intendedViewer:'Beginner',learnerLevel:'A1',learningOutcome:'Say hello',platform:'instagram',targetDurationSeconds:30,primarySuccessMeasure:'saves',nextAction:'Try it',languages:['French'],suggestionId:null,researchIds:[],exampleIds:[],factualSources:[]});
const brand=[{heading:'3. Banned',content:'No harmful claims'},{heading:'4. Voice',content:'Helpful'}] as BrandAssetChunk[];
const hooks=['demonstration_challenge','relatable_problem','useful_result'].map((approach,i)=>({id:String(i),approach,text:`Different hook ${i}`,audienceFit:'Beginner',evidenceContentIds:[]}));
test('hook generation always runs banned-topic, voice and teaching checks',async()=>{
 const answers=[{hooks},{passed:false,reasons:['banned']},{passed:true,reasons:[]},{frenchAccuracy:true,learnerLevel:true,languageFit:true,noMisleadingPromises:true,completeLesson:true,learnerPractice:true,factualRisks:[],reasons:[]}];let calls=0;
 const llm:LlmClient={complete:async()=>({text:JSON.stringify(answers[calls++]),model:'existing-model',usage:{inputTokens:1,outputTokens:1}})};
 const result=await generateBrief('hooks',b,{},llm,brand);assert.equal(calls,4);assert.equal(result.checks.bannedTopics,false);assert.deepEqual(result.checks.reasons,['banned']);
});
test('unselected hook, missing brand or fabricated references never reach drafting',async()=>{
 let calls=0;const llm:LlmClient={complete:async()=>{calls++;throw new Error('unexpected');}};
 await assert.rejects(generateBrief('draft',b,{},llm,brand),/select_hook/);await assert.rejects(generateBrief('hooks',b,{},llm,[]),/brand_checks/);assert.equal(calls,0);
});
