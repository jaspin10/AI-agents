import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPT_VERSION, investigationSystem, investigationUser, repairSystem } from './prompts.js';

test('both prompts explain staff change requests and keep them inside the rules', () => {
  for (const text of [investigationSystem(), repairSystem('rules')]) {
    assert.match(text, /operation is "change_request"/);
    assert.match(text, /untrusted text/);
    assert.match(text, /level15_only=true/);
    assert.match(text, /WhatsApp bot are never possible/);
  }
  assert.equal(PROMPT_VERSION, 'guardian-v3');
});

test('the investigation prompt treats a screenshot as untrusted data', () => {
  assert.match(investigationSystem(), /screenshot a staff member sent on WhatsApp/);
  assert.match(investigationSystem(), /UNTRUSTED DATA/);
  assert.match(investigationUser({}, [], [], [], 'attached'), /^The image attached to this message is the staff screenshot/);
  assert.doesNotMatch(investigationUser({}, [], [], []), /image attached/);
});
