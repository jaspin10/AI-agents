import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withCallBudget } from './budget.js';
test('reservation rejection makes no paid call', async () => {
  let calls = 0;
  const llm = withCallBudget({ complete: async () => { calls++; throw new Error(); } }, { reserve: async () => { throw new Error('cap'); }, settle: async () => {} });
  await assert.rejects(llm.complete({system:'s',user:'u'})); assert.equal(calls,0);
});
test('every retry reserves first and success settles once', async () => {
  const events: string[] = [];
  const llm = withCallBudget({ complete: async () => { events.push('call'); return {text:'ok',model:'existing',usage:{inputTokens:1,outputTokens:1}}; } }, { reserve: async (_, n) => { assert.ok(n > 2048); events.push('reserve'); }, settle: async () => {events.push('settle');} });
  await llm.complete({system:'s',user:'u'}); await llm.complete({system:'s',user:'u'});
  assert.deepEqual(events,['reserve','call','settle','reserve','call','settle']);
});
