import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { briefFailure } from './brief-errors.js';

test('brief generation failures distinguish configuration, budget, provider and output',()=>{
 const cases:Array<[unknown,string]>=[
  [new Error('LLM key or positive budget unavailable'),'generation_not_configured'],
  [new Error('LLM budget unavailable or exhausted; no call made'),'generation_budget_unavailable'],
  [new Error('LLM accounting unavailable; reservation retained'),'generation_accounting_unavailable'],
  [new Error('brand_checks_unavailable'),'generation_brand_unavailable'],
  [Object.assign(new Error('secret provider body'),{status:401}),'generation_provider_auth'],
  [Object.assign(new Error('secret provider body'),{status:429}),'generation_rate_limited'],
  [Object.assign(new Error('secret provider body'),{name:'APIConnectionTimeoutError'}),'generation_timeout'],
  [new SyntaxError('private model output'),'generation_invalid_output'],
  [new z.ZodError([]),'generation_invalid_output'],
  [new Error('unknown private details'),'generation_failed'],
 ];
 for(const [error,code] of cases){const result=briefFailure(error);assert.equal(result.code,code);assert.doesNotMatch(JSON.stringify(result),/secret provider|private model|unknown private/);}
});
