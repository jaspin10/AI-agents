import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
export async function database() {
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table public.performance(id uuid primary key);
 create table public.content(id uuid primary key);
 create table public.suggestions(id uuid primary key);
 create table public.llm_usage(id uuid primary key default gen_random_uuid(), run_id uuid, agent text, model text, input_tokens integer, output_tokens integer, month text);
 grant usage on schema public to service_role; grant all on all tables in schema public to service_role;`);
 for (const name of (await readdir('supabase/migrations')).filter(n=>/^2026.*_x\d/.test(n)).sort()) await db.exec(await readFile(`supabase/migrations/${name}`,'utf8'));
 return db;
}
test('budget migration: cap, idempotent settlement, uncertain reservation, and role denial', async () => {
 const db=await database();
 try {
  await db.exec(`set role service_role; select reserve_llm_call('00000000-0000-4000-8000-000000000001',70,100);`);
  await assert.rejects(db.exec(`select reserve_llm_call('00000000-0000-4000-8000-000000000002',40,100);`),/LLM_CAP_EXCEEDED/);
  await db.exec(`select settle_llm_call('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','test','mock',10,10); select settle_llm_call('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','test','mock',10,10);`);
  assert.equal((await db.query('select count(*)::int as n from llm_usage')).rows[0].n,1);
  await db.exec(`select reserve_llm_call('00000000-0000-4000-8000-000000000002',80,100);`);
  await assert.rejects(db.exec(`select reserve_llm_call('00000000-0000-4000-8000-000000000003',1,100);`),/LLM_CAP_EXCEEDED/);
  await db.exec('reset role; set role anon;');
  await assert.rejects(db.exec(`select reserve_llm_call('00000000-0000-4000-8000-000000000004',1,100);`),/permission denied/);
 } finally {await db.close();}
});
test('studio revisions: CAS, immutable history, replay safety, no public access',async()=>{
 const db=await database();const id='00000000-0000-4000-8000-000000000050',req='00000000-0000-4000-8000-000000000051';
 try {
  await db.exec(`insert into content(id) values('${id}'); set role service_role;`);
  const save=(version,request,body='{}')=>db.query('select save_studio_record($1,$2,$3,$4,$5,$6,$7) as r',[id,'memory',id,version,body,'test',request]);
  assert.equal((await save(0,req)).rows[0].r.version,1);assert.equal((await save(0,req)).rows[0].r.version,1);
  await assert.rejects(save(0,'00000000-0000-4000-8000-000000000052'),/version_conflict/);
  await assert.rejects(save(0,req,'{"changed":true}'),/request_conflict/);
  assert.equal((await save(1,'00000000-0000-4000-8000-000000000053','{"changed":true}')).rows[0].r.version,2);
  assert.equal((await db.query('select count(*)::int as n from studio_revisions')).rows[0].n,2);
  await assert.rejects(db.exec('delete from studio_revisions'),/permission denied/);
  await db.exec('reset role; set role authenticated');await assert.rejects(db.exec('select * from studio_records'),/permission denied/);
 }finally{await db.close();}
});
test('research dedup key is atomic on both creation and editing',async()=>{
 const db=await database();try {
  const a='00000000-0000-4000-8000-000000000070',b='00000000-0000-4000-8000-000000000071';
  await db.exec('set role service_role');
  const save=(id,key,version,request)=>db.query('select save_studio_record($1,$2,$3,$4,$5,$6,$7)',[id,'research',key,version,'{}','test',request]);
  await save(a,'same',0,'00000000-0000-4000-8000-000000000072');
  await assert.rejects(save(b,'same',0,'00000000-0000-4000-8000-000000000073'),/unique constraint/);
  await save(b,'different',0,'00000000-0000-4000-8000-000000000074');
  await assert.rejects(save(b,'same',1,'00000000-0000-4000-8000-000000000075'),/unique constraint/);
 }finally{await db.close();}
});
