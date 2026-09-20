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
