import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { createStudioRouter, type StudioEnv, type StudioDependencies } from './studio.js';
const id=randomUUID();
function app(role:string|null, exists=true){
 let reads=0;
 const host=new Hono<StudioEnv>();host.use('*',async(c,next)=>{c.set('auth',role?{role,email:'test@example.com'}:null);await next();});
 const deps={store:{get:async()=>{reads++;return null;},history:async()=>[]},memory:{content:{all:async()=>exists?[{id}]:[]}}} as unknown as StudioDependencies;
 host.route('/api/studio',createStudioRouter(deps));return {host,reads:()=>reads};
}
test('anonymous and non-marketing roles cannot reach studio data',async()=>{for(const [role,status] of [[null,401],['salesman',403],['student',403]] as const){const a=app(role);assert.equal((await a.host.request(`/api/studio/memory/${id}`)).status,status);assert.equal(a.reads(),0);}});
test('owner/marketing access valid content; foreign ids do not expose records',async()=>{for(const role of ['owner','marketing']){assert.equal((await app(role).host.request(`/api/studio/memory/${id}`)).status,200);}const a=app('owner',false);assert.equal((await a.host.request(`/api/studio/memory/${id}`)).status,404);assert.equal(a.reads(),0);});
test('cross-site write is denied before parsing or storage',async()=>{assert.equal((await app('owner').host.request(`/api/studio/memory/${id}`,{method:'PUT',headers:{'sec-fetch-site':'cross-site','content-type':'application/json'},body:'{}'})).status,403);});
