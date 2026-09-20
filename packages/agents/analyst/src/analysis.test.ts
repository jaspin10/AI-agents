import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rates, type ContentRow, type PerformanceRecord } from '@platform/shared';
import { analyse, validateEvidence } from './analysis.js';
function fixture(platform: ContentRow['platform'] = 'tiktok') {
  const id = randomUUID();
  const c: ContentRow = {id, platform, platformVideoId:'same-id', title:'t', hook:null, format:'lesson',hypothesis:null,postedAt:'2026-09-01T12:00:00Z'};
  const p: PerformanceRecord = {id:randomUUID(),contentId:'same-id',contentUuid:id,platform,capturedAt:'2026-09-08T12:00:00Z',capturedDate:'2026-09-08',metrics:{views:1000,likes:10,comments:3,shares:2,saves:5,avgWatchTimeSeconds:null,retentionPct:null,followersAtCapture:null}};
  return {c,p};
}
test('canonical UUID isolates colliding native ids and includes saves with canonical units', () => {
  const a=fixture(), b=fixture('instagram'); b.p.metrics.likes=100;
  const s=analyse([a.c,b.c],[a.p,b.p]);
  assert.equal(s.all[0]?.engagementRatePct,rates({...a.p.metrics,capturedDate:a.p.capturedDate}).engagementRatePct);
  assert.equal(s.all[0]?.engagementRatePct,2); assert.equal(s.all[1]?.engagementRatePct,11);
  assert.equal(analyse([a.c],[{...a.p,contentUuid:null}]).all.length,0);
});
test('platform/age/exposure cohorts require eight; different platforms are not global competitors', () => {
  const fs=[...Array.from({length:8},()=>fixture()),...Array.from({length:8},()=>fixture('instagram'))];
  const s=analyse(fs.map(x=>x.c),fs.map(x=>x.p));
  assert.equal(s.top.filter(x=>x.platform==='tiktok').length,3); assert.equal(s.top.filter(x=>x.platform==='instagram').length,3);
  assert.equal(analyse([fs[0]!.c],[fs[0]!.p]).top.length,0);
});
test('unsupported/legacy zero stays unknown; explicit observed zero survives', () => {
  const {c,p}=fixture(); p.metrics.shares=0;
  let s=analyse([c],[p]); assert.equal(s.all[0]?.metrics['shares']?.value,null); assert.equal(s.all[0]?.shareRatePct,null);
  p.provenance={shares:{nativeName:'shares',source:'fixture',observationWindow:'lifetime',capturedAt:p.capturedAt,denominator:'views',definitionVersion:'v1',availability:'observed'}};
  s=analyse([c],[p]); assert.equal(s.all[0]?.metrics['shares']?.value,0); assert.equal(s.all[0]?.shareRatePct,null,'C4 heuristic unchanged');
  p.provenance.shares!.availability='unsupported'; assert.equal(analyse([c],[p]).all[0]?.metrics['shares']?.value,null);
});
test('fabricated citations and runs are refused', () => {
  const {c,p}=fixture();const s=analyse([c],[p]);validateEvidence([c.id!],null,s);
  assert.throws(()=>validateEvidence([randomUUID()],null,s));assert.throws(()=>validateEvidence([c.id!],randomUUID(),s));
});

test('same UUID on wrong platform and different observed ages are excluded from comparisons', () => {
 const fs=Array.from({length:8},()=>fixture());
 fs[0]!.p.capturedDate='2026-09-09'; fs[0]!.p.capturedAt='2026-09-09T12:00:00Z';
 assert.equal(analyse(fs.map(x=>x.c),fs.map(x=>x.p)).top.length,0);
 assert.equal(analyse([fs[1]!.c],[{...fs[1]!.p,platform:'instagram'}]).all.length,0);
});
