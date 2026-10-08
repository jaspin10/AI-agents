import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideWatch } from './revert.js';

const now = 1_000_000;
const later = now + 1;

test('same error once -> revert', () => {
  assert.equal(decideWatch({ sameSinceMerge: 1, totalSinceMerge: 1, totalBeforeMerge: 50 }, now, later).action, 'revert');
});

test('doubling with at least 3 new errors -> revert', () => {
  assert.equal(decideWatch({ sameSinceMerge: 0, totalSinceMerge: 4, totalBeforeMerge: 2 }, now, later).action, 'revert');
  assert.equal(decideWatch({ sameSinceMerge: 0, totalSinceMerge: 3, totalBeforeMerge: 0 }, now, later).action, 'revert');
});

test('doubling but fewer than 3 new errors -> no revert', () => {
  assert.equal(decideWatch({ sameSinceMerge: 0, totalSinceMerge: 2, totalBeforeMerge: 0 }, now, later).action, 'wait');
});

test('3+ errors but not double -> no revert', () => {
  assert.equal(decideWatch({ sameSinceMerge: 0, totalSinceMerge: 5, totalBeforeMerge: 3 }, now, later).action, 'wait');
});

test('quiet until the window ends -> keep', () => {
  assert.equal(decideWatch({ sameSinceMerge: 0, totalSinceMerge: 0, totalBeforeMerge: 0 }, later, later).action, 'keep');
});
