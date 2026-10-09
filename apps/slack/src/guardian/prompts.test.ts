import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPT_VERSION, investigationSystem, repairSystem } from './prompts.js';

test('both prompts explain staff change requests and keep them inside the rules', () => {
  for (const text of [investigationSystem(), repairSystem('rules')]) {
    assert.match(text, /operation is "change_request"/);
    assert.match(text, /untrusted text/);
    assert.match(text, /level15_only=true/);
    assert.match(text, /WhatsApp bot are never possible/);
  }
  assert.equal(PROMPT_VERSION, 'guardian-v2');
});
