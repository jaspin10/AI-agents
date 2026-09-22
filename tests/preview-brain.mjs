/** Local, read-only, synthetic fixture server. Never imported by a production entrypoint.
 * Node 20: pnpm build && node tests/preview-brain.mjs [--marketing] [--empty|--partial]
 * No credentials, database, media, paid model, or external network is used.
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createBrainRouter } from '../apps/api/dist/brain.js';
import { createStudioRouter } from '../apps/api/dist/studio.js';
import { newBrief, emptyChecklist, CreativeMemorySchema, correlate, rates, velocity, followerNormalised, adSplit } from '../packages/shared/dist/index.js';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {Hono}=require('hono'),{serve}=require('@hono/node-server'),{serveStatic}=require('@hono/node-server/serve-static');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const now='2026-09-09T12:00:00Z',empty=process.argv.includes('--empty'),partial=process.argv.includes('--partial');
const role=process.argv.includes('--marketing')?'marketing':'owner';
const content=empty?[]:Array.from({length:19},(_,i)=>({id:id(i+1),platform:i<9?'tiktok':'instagram',platformVideoId:'fixture-'+i,title:['A greeting you can use today','The opening that needs a clearer promise','Practice one French phrase'][i%3]+' · FIXTURE '+(i+1),hook:null,format:'Talking head',hypothesis:'practice-first',postedAt:'2026-09-01T12:00:00Z'}));
const performance=content.slice(0,18).map((c,i)=>({id:id(100+i),contentId:c.platformVideoId,contentUuid:c.id,platform:c.platform,capturedDate:'2026-09-08',capturedAt:'2026-09-08T12:00:00Z',metrics:{views:2000,likes:i%9===0?150:i%9===1?40:90,comments:10,shares:0,saves:null,avgWatchTimeSeconds:18,retentionPct:null,followersAtCapture:1000}}));
const analyses=content.slice(0,18).map(c=>({contentId:c.id,description:'Human-entered fixture lesson context',hookText:'Can you say this greeting?',format:c.format,hasModel:true,hasCta:true,ctaType:'Comment',adBoosted:null,ideaSource:'Learner questions',analysedBy:'fixture@example.com',analysedAt:now}));
const suggestions=empty?[]:Array.from({length:3},(_,i)=>({id:id(200+i),runId:id(250),taskId:id(251),agent:'analyst',kind:'next_video',status:'surfaced',hypothesis:'practice-first',createdAt:now,bannedTopicsPassed:true,bannedTopicsReasons:[],brandVoicePassed:true,brandVoiceReasons:[],payload:{kind:'next_video',theme:['A more specific opening promise','Repeat the greeting lesson','Turn a real question into practice'][i]+' · FIXTURE',hook:'Try a short French greeting',format:'Talking head',rationale:'Synthetic test case for reviewing the interface.',evidenceMode:'supported_pattern',evidenceContentIds:[id(i+1)],insightRunId:id(900)}}));
const record=(kind,n,body,version=1)=>({id:id(n),kind,entityKey:id(n),version,body,updatedBy:'fixture@example.com',updatedAt:now});
const checks={bannedTopics:true,brandVoice:true,frenchAccuracy:true,learnerLevel:true,languageFit:true,noMisleadingPromises:true,completeLesson:true,learnerPractice:true,factualRisks:[],reasons:[]};
const briefs=empty?[]:Array.from({length:7},(_,i)=>{
  const body=newBrief({topic:['Greetings to repeat','Clarify the opening','An audience question'][i%3]+' · FIXTURE '+i,intendedViewer:'Adult beginner',learnerLevel:'A1',learningOutcome:'Practice one greeting',platform:'tiktok',targetDurationSeconds:60,primarySuccessMeasure:'Day 7 engagement',nextAction:'Practice aloud',languages:['French'],suggestionId:suggestions[i%3].id,researchIds:[id(700)],exampleIds:[id(1)],factualSources:[]});
  body.hooks=[{id:'hook',approach:'useful_result',text:'Learn one useful greeting',audienceFit:'Beginners',evidenceContentIds:[id(1)]}];body.selectedHookId='hook';body.hookChecks=checks;body.draftChecks=checks;
  body.draft={spokenScript:'Bonjour. Repeat the greeting aloud.',firstFrameText:'A useful greeting',visualBeats:[{atSeconds:0,visual:'Presenter demonstrates the phrase',bRoll:''}],subtitles:'Bonjour.',payoff:'A greeting to practice',learnerPractice:'Repeat once',cta:'Try it aloud',evidenceContentIds:[id(1)],factualSourceIds:[]};
  if(i!==0)body.approval={by:'fixture@example.com',at:now,version:2,factualConfirmation:'Synthetic review record for local QA only.'};
  return record('brief',300+i,body,2);
});
const production=briefs.map((b,i)=>record('production',400+i,{briefId:b.id,briefVersion:2,owner:'Fixture reviewer',dueDate:'2026-09-08',responsibilities:{preparer:'Fixture preparer',recorder:'Fixture recorder',editor:'Fixture editor',reviewer:'Fixture reviewer'},blockers:i===1?['Need the correct caption file']:[],assets:[],currentAssetVersion:null,requests:[],checklist:emptyChecklist(),stage:['selected','brief_approved','filmed','edit_review','approved','posted','reviewed'][i],approval:null}));
const memories=content.map((c,i)=>record('memory',i+1,CreativeMemorySchema.parse({audience:'Adult beginner',learnerLevel:'A1',topic:'Greeting practice',purpose:'Practice one phrase',languageMix:['French'],durationSeconds:60,openingLine:'Can you say this greeting?',firstPayoffSeconds:4,ctaSeconds:50,asset:null,contributors:{writer:'Fixture writer',filmer:'Fixture recorder',editor:'Fixture editor'},classification:{value:'uncertain',source:'',reviewed:false},annotations:[]})));
const research=empty?[]:[record('research',700,{text:'How can I greet a colleague in French?',theme:'Greetings',category:'learning',sourceType:'learner_question',sourceUrl:null,sourceDate:'2026-09-01',context:'Synthetic anonymous question for local QA.',approvedRedacted:true,audienceRelevance:'Beginner practice',teachingUsefulness:'A short useful phrase',productionEffort:'small',recentCoverage:'No fixture coverage',archived:false})];
const link=empty?null:{id:id(800),production_id:id(405),brief_id:id(305),brief_version:2,content_uuid:id(1),asset_version:'fixture-export-v1',asset_fingerprint:'synthetic-identity',confirmed_at:now,confirmed_by:'fixture@example.com'};
const insightVideos=content.slice(0,18).map((c,i)=>({id:c.id,platform:c.platform,platformVideoId:c.platformVideoId,title:c.title,postedAt:c.postedAt,format:c.format,ideaSource:'Learner questions',ctaType:'Comment',hasModel:true,hypothesis:c.hypothesis,adBoosted:null,analysed:true,views:2000,engagementRatePct:rates({...performance[i].metrics,capturedDate:'2026-09-08'},{sharesReported:false}).engagementRatePct,analysis:analyses[i],twinIds:[],adRunCount:0}));
const report=correlate(insightVideos,suggestions.map(s=>({id:s.id,theme:s.payload.theme,status:s.status,hypothesis:s.hypothesis,format:s.payload.format,createdAt:s.createdAt})),{b2Unresolved:true,now});
const run=empty?null:{id:id(900),runId:id(901),trigger:'manual',triggeredBy:'fixture@example.com',status:'numbers_only',videoCount:content.length,analysedCount:analyses.length,createdAt:now,inputTokens:0,outputTokens:0,report:{...report,narrative:null,llm:{status:'skipped',reason:'Read-only local fixture'},tagProposals:0}};
const all=[...briefs,...production,...memories,...research];
const store={list:async kind=>all.filter(r=>r.kind===kind),allMemories:async()=>memories,get:async(kind,rid)=>all.find(r=>r.kind===kind&&r.id===rid)??null,revision:async(kind,rid,version)=>all.find(r=>r.kind===kind&&r.id===rid&&r.version===version)??null,history:async(kind,rid)=>all.filter(r=>r.kind===kind&&r.id===rid),jobs:async()=>[],lineage:async rid=>link?.production_id===rid?[link]:[]};
const memory={content:{all:async()=>content},performance:{all:async()=>{if(partial)throw Error('Intentional fixture source failure');return performance;}},contentAnalysis:{all:async()=>analyses},suggestions:{all:async()=>suggestions},insightRuns:{latest:async()=>run},hypothesisSuggestions:{all:async()=>[]}};
const app=new Hono();
// Local harness has its own fixed identity. Production authentication is neither imported nor bypassed.
app.use('*',async(c,next)=>{if(!['GET','HEAD'].includes(c.req.method))return c.json({error:'fixture_read_only'},405);c.set('auth',{role,email:'fixture@example.com'});await next();});
app.route('/analytics/api/brain',createBrainRouter({memory,store,lineage:{recent:async()=>link?[link]:[],forContent:async rid=>link?.content_uuid===rid?[link]:[]},running:()=>false,now:()=>now}));
app.route('/analytics/api/studio',createStudioRouter({store,memory}));
app.get('/analytics/api/me',c=>c.json({role,email:'fixture@example.com'}));
app.get('/analytics/api/suggestions',c=>c.json(suggestions));
app.get('/analytics/api/analysis',c=>c.json({videos:content.map((v,i)=>({...v,analysis:analyses[i]??null,metrics:performance[i]?{...performance[i].metrics,capturedDate:'2026-09-08'}:null,adRuns:[],crossPlatformRefVideos:[]})),ideaSources:['Learner questions']}));
app.get('/analytics/api/insights/latest',c=>c.json({run,proposals:[],videos:Object.fromEntries(content.map(c=>[c.id,c])),running:false}));
app.get('/analytics/api/metrics',c=>c.json({today:now.slice(0,10),sharesReportedPlatforms:[],videos:content.map((v,i)=>{const p=performance[i],snaps=p?[{...p.metrics,capturedDate:p.capturedDate}]:[];return {...v,snapshotCount:snaps.length,latestCapturedDate:p?.capturedDate??null,views:p?.metrics.views??null,rates:p?rates(snaps[0],{sharesReported:false}):null,velocity:velocity(snaps,v.postedAt,now.slice(0,10)),followerNormalised:followerNormalised(snaps,v.postedAt),adSplit:adSplit(snaps,[],now.slice(0,10)),twinIds:[]};})}));
app.get('/analytics/api/*',c=>c.json({error:'This endpoint is not part of the read-only marketing fixture.'},503));
const dist=fileURLToPath(new URL('../apps/dash/dist',import.meta.url));
app.use('/analytics/assets/*',serveStatic({root:dist,rewriteRequestPath:p=>p.replace('/analytics','')}));
const shell=(await readFile(dist+'/index.html','utf8')).replace('<body>','<body><div style="padding:8px 16px;background:#594522;color:#fff;font:14px system-ui">SYNTHETIC FIXTURE · read-only local QA · no real account data · '+role+'</div>');
app.get('/analytics/*',c=>c.html(shell));
app.get('/',c=>c.html('<!doctype html><title>Marketing Brain QA</title><style>body{font:16px system-ui;background:#ddd;margin:16px}iframe{height:900px;border:1px solid #888;display:block;margin-top:16px;max-width:none}</style><h1>Marketing Brain local QA</h1><p>Synthetic data only. Choose a viewport, then use the real built dashboard inside the frame.</p><label>Viewport <select onchange="document.querySelector(\'iframe\').style.width=this.value+\'px\'">'+[1440,1280,1024,768,390,320].map(w=>'<option>'+w+'</option>').join('')+'</select></label><p><a href="/analytics/brain">Open the full dashboard</a></p><iframe title="Synthetic marketing workspace" src="/analytics/brain" style="width:1440px"></iframe>'));
if(process.argv.includes('--check')) {
  const response=await app.request('/analytics/api/brain');assert.equal(response.status,200);
  const overview=await response.json();
  if(partial){assert.equal(overview.videos,null);assert.ok(overview.sourceErrors.includes('performance'));}
  else {assert.deepEqual(overview.sourceErrors,[]);assert.equal(overview.videos.length,empty?0:19);if(!empty){assert.equal(overview.videos.filter(v=>v.outcome==='above').length,2);assert.equal(overview.videos.filter(v=>v.outcome==='below').length,2);assert.equal(overview.videos.filter(v=>v.outcome==='unmeasured').length,1);}}
  for(const path of ['studio/production','studio/briefs','studio/research','analysis','metrics','insights/latest','me'])assert.equal((await app.request('/analytics/api/'+path)).status,200,path);
  if(!empty&&!partial){const detail=await (await app.request('/analytics/api/brain/video/'+id(1))).json();assert.equal(detail.comparison.peers.length,8);}
  if(!empty){const journey=await (await app.request('/analytics/api/brain/journey/'+id(1))).json();assert.equal(journey.confirmed[0].link.brief_version,2);}
  assert.equal((await app.request('/analytics/api/studio/briefs/'+id(300),{method:'PUT',body:'{}'})).status,405);
  assert.equal((await app.request('/analytics/brain')).status,200);
  const asset=shell.match(/src="([^"]+\.js)"/)[1];assert.equal((await app.request(asset)).status,200,'built JavaScript served');
  console.log('Preview smoke passed: '+(empty?'empty':partial?'partial failure':'populated')+' / '+role+'; API projections, built assets, exact lineage and read-only protection. This is not a visual browser check.');
} else {
  serve({fetch:app.fetch,hostname:'127.0.0.1',port:5173},()=>console.log('Read-only synthetic preview: http://127.0.0.1:5173 — Ctrl+C stops it.'));
}
