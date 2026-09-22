import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { BRAIN_VIEWS, BRAIN_STAGE_IDS, BRAIN_CONNECTIONS, BRAIN_AGENTS } from '../packages/shared/dist/browser.js';
const require=createRequire(new URL('../apps/dash/package.json',import.meta.url));
const ts=require('typescript');
const source=await readFile(new URL('../apps/dash/src/guides.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {GUIDES}=await import('data:text/javascript,'+encodeURIComponent(code));
test('every reachable major workspace has the full guide contract',()=>{
  assert.deepEqual(Object.keys(GUIDES).sort(),[...BRAIN_VIEWS].sort());
  const keys=['title','purpose','inputs','outputs','source','ai','limits','approval','good','failures','next'];
  for(const [area,guide] of Object.entries(GUIDES)){assert.deepEqual(Object.keys(guide).sort(),keys.toSorted());for(const key of keys)assert.ok(typeof guide[key]==='string'&&guide[key].trim().length>(key==='title'?0:10),area+': '+key);}
});
test('brain map forms one complete learning loop and agent handoffs reference real departments',()=>{
  assert.equal(BRAIN_CONNECTIONS.length,6);let cursor='strategy';const visited=new Set();
  for(let i=0;i<6;i++){assert.ok(!visited.has(cursor));visited.add(cursor);cursor=BRAIN_CONNECTIONS.find(e=>e.from===cursor).to;}
  assert.equal(cursor,'strategy');assert.deepEqual([...visited].sort(),[...BRAIN_STAGE_IDS].sort());
  for(const agent of BRAIN_AGENTS)for(const stage of [...agent.upstream,...agent.downstream])assert.ok(BRAIN_STAGE_IDS.includes(stage==='learnings'?'learning':stage));
});
