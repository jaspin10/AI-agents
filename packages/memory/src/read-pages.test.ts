import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPages } from './read-pages.js';
test('read beyond the default 1000-row Supabase boundary without overlap',async()=>{
  const source=Array.from({length:2001},(_,i)=>i),calls:number[][]=[];
  const result=await readPages<number>(async(from,to)=>{calls.push([from,to]);return {data:source.slice(from,to+1),error:null};});
  assert.deepEqual(result,source);assert.deepEqual(calls,[[0,999],[1000,1999],[2000,2999]]);
});
test('an exact page boundary requires an empty final page',async()=>{
  let calls=0;assert.deepEqual(await readPages<number>(async(from)=>{calls++;return {data:from===0?[1,2]:[],error:null};},2),[1,2]);assert.equal(calls,2);
});
test('failed later pages reject the entire read instead of returning a truncated count',async()=>{
  await assert.rejects(readPages<number>(async(from)=>from===0?{data:[1,2],error:null}:{data:null,error:new Error('secret')},2),e=>e instanceof Error&&!e.message.includes('secret'));
});
