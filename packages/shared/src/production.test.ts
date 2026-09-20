import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { editProduction,advanceProduction,emptyChecklist,type ProductionEdit } from './production.js';
const input=():ProductionEdit=>({briefId:randomUUID(),briefVersion:4,owner:'Jas',dueDate:null,responsibilities:{preparer:'Eknoor',recorder:'Jas',editor:'Loop Studio',reviewer:'Jas'},blockers:[],assets:[{version:'v1',url:'https://example.com/approved-v1',fingerprint:'human checksum',durationSeconds:30,approvedReference:true}],currentAssetVersion:'v1',requests:[],checklist:emptyChecklist().map(x=>({...x,status:'pass'}))});
test('production progression cannot skip brief/filming/review or approve without owner/checklist',()=>{
 let b=editProduction(input(),null);assert.equal(b.stage,'selected');assert.throws(()=>advanceProduction(b,'approved','Jas','owner',2,true),/invalid_stage/);
 assert.throws(()=>advanceProduction(b,'brief_approved','Jas','owner',2,false),/approved_brief/);
 for(const stage of ['brief_approved','filmed','edit_review'] as const)b=advanceProduction(b,stage,'Jas','owner',2,true);
 assert.throws(()=>advanceProduction(b,'approved','editor','marketing',5,true),/owner/);
 for(const key of ['rightsConsent','factualAccuracy'] as const){const bad={...b,checklist:b.checklist.map(c=>c.key===key?{...c,status:'not_applicable' as const,note:'skip'}:c)};assert.throws(()=>advanceProduction(bad,'approved','Jas','owner',5,true),/production_checks/);}
 const approved=advanceProduction(b,'approved','Jas','owner',5,true);assert.equal(approved.approval?.assetVersion,'v1');assert.equal(approved.approval?.briefVersion,4);
 assert.throws(()=>advanceProduction(approved,'posted','Jas','owner',6,true),/invalid_stage/);
});
test('asset identities and brief versions immutable; new export resets rights/factual review and approval',()=>{
 const i=input(),old={...editProduction(i,null),stage:'approved' as const};
 assert.throws(()=>editProduction({...i,assets:[{...i.assets[0]!,fingerprint:'replacement'}]},old),/immutable/);
 assert.throws(()=>editProduction({...i,briefVersion:5},old),/brief_version_locked/);
 const next=editProduction({...i,assets:[...i.assets,{...i.assets[0]!,version:'v2'}],currentAssetVersion:'v2'},old);
 assert.equal(next.stage,'edit_review');assert.equal(next.approval,null);assert.ok(next.checklist.every(c=>c.status==='pending'));
 assert.throws(()=>editProduction(i,{...old,stage:'posted'}),/posted_item_locked/);
 const selected=editProduction(i,null);assert.equal(editProduction({...i,assets:[...i.assets,{...i.assets[0]!,version:'v2'}],currentAssetVersion:'v2'},selected).stage,'selected');
});
test('finite requests require valid asset timecodes and explicit resolution; blockers prevent progress',()=>{
 const i=input(),r={id:randomUUID(),assetVersion:'v1',atSeconds:50,type:'defect' as const,text:'Speech clipped',status:'open' as const,resolution:''};
 assert.throws(()=>editProduction({...i,requests:[r]},null),/invalid_revision/);
 const b=editProduction({...i,requests:[{...r,atSeconds:3}]},null);
 assert.throws(()=>editProduction({...i,requests:[]},b),/revision_history/);
 assert.throws(()=>advanceProduction({...b,stage:'edit_review'},'approved','Jas','owner',3,true),/unresolved_revisions/);
 assert.throws(()=>advanceProduction({...b,blockers:['Permission pending']},'brief_approved','Jas','owner',3,true),/unresolved_blockers/);
});
