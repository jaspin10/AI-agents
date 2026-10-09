import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awaitingApprovalNotice } from './notices.js';

test('big-fix notice carries the 8-character fix number and both replies', () => {
  const text = awaitingApprovalNotice('show the score again', 'a1b2c3d4-0000-4000-8000-000000000000', false);
  assert.match(text, /^a big fix is waiting \(fix #a1b2c3d4: show the score again\)/);
  assert.match(text, /reply APPROVE a1b2c3d4 or REJECT a1b2c3d4/);
  assert.doesNotMatch(text, /-0000-/);
});

test('staff change request notice says it was asked for on WhatsApp', () => {
  const text = awaitingApprovalNotice('hide CLB on Level 1.5 results', 'ffff1234-0000-4000-8000-000000000000', true);
  assert.match(text, /^a change someone asked for on WhatsApp is ready \(fix #ffff1234/);
  assert.match(text, /APPROVE ffff1234/);
});
