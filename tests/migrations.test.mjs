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
test('generation jobs refuse duplicate requests and concurrent work for one brief',async()=>{
 const db=await database();try{
  const id='00000000-0000-4000-8000-000000000080',job='00000000-0000-4000-8000-000000000082';await db.exec('set role service_role');
  await db.query('select save_studio_record($1,$2,$3,0,$4,$5,$6)',[id,'brief',id,'{}','test','00000000-0000-4000-8000-000000000081']);
  const insert=j=>db.query("insert into studio_jobs(id,record_id,stage,actor) values($1,$2,'hooks','test')",[j,id]);await insert(job);await assert.rejects(insert(job),/unique constraint/);
  await assert.rejects(insert('00000000-0000-4000-8000-000000000083'),/unique constraint/);
  await db.query("update studio_jobs set status='complete' where id=$1",[job]);await insert('00000000-0000-4000-8000-000000000083');
 }finally{await db.close();}
});
test('confirmed lineage is atomic, exact-versioned, replay safe and separate from inferred matching',async()=>{
 const db=await database();try{
  const brief='00000000-0000-4000-8000-000000000090',prod='00000000-0000-4000-8000-000000000091',content='00000000-0000-4000-8000-000000000092',request='00000000-0000-4000-8000-000000000093';
  await db.query('insert into content(id) values($1)',[content]);await db.exec('set role service_role');
  await db.query('select save_studio_record($1,$2,$3,0,$4,$5,$6)',[brief,'brief',brief,JSON.stringify({approval:{version:1}}),'Jas','00000000-0000-4000-8000-000000000094']);
  const body={stage:'approved',briefId:brief,briefVersion:1,currentAssetVersion:'v1',assets:[{version:'v1',fingerprint:'exact'}],approval:{assetVersion:'v1',fingerprint:'exact',briefId:brief,briefVersion:1}};
  const save=(version,b,req)=>db.query('select save_studio_record($1,$2,$3,$4,$5,$6,$7)',[prod,'production',brief,version,JSON.stringify(b),'Jas',req]);
  await save(0,{...body,approval:null},'00000000-0000-4000-8000-000000000095');
  const confirm=(v,c=content,r=request)=>db.query('select confirm_production_lineage($1,$2,$3,$4,$5) as r',[prod,v,c,'Jas',r]);
  await assert.rejects(confirm(1),/exact_approval_required/);
  await save(1,body,'00000000-0000-4000-8000-000000000096');
  await assert.rejects(confirm(2,'00000000-0000-4000-8000-000000000099'),/content_missing/);
  assert.equal((await db.query('select version from studio_records where id=$1',[prod])).rows[0].version,2);
  assert.equal((await confirm(2)).rows[0].r.body.stage,'posted');assert.equal((await confirm(2)).rows[0].r.version,3);
  await assert.rejects(confirm(2,brief),/request_conflict/);
  await assert.rejects(confirm(3,content,'00000000-0000-4000-8000-000000000097'),/unique constraint/);
  assert.equal((await db.query('select version from studio_records where id=$1',[prod])).rows[0].version,3);
  const rows=(await db.query('select * from production_lineage')).rows;assert.equal(rows.length,1);assert.equal(rows[0].basis,'human_confirmed');assert.equal(rows[0].brief_version,1);assert.equal(rows[0].asset_fingerprint,'exact');
  await assert.rejects(db.exec('delete from production_lineage'),/permission denied/);
  await db.exec('reset role;set role anon');await assert.rejects(confirm(3),/permission denied/);
 }finally{await db.close();}
});
