import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideMergeGate } from './gate.js';

const young = 60 * 1000;
const old = 60 * 60 * 1000;

test('passing Vercel build -> merge', () => {
  assert.equal(decideMergeGate([{ context: 'Vercel', state: 'success' }], young).action, 'merge');
});

test('failed or errored build -> fail, never merge', () => {
  assert.equal(decideMergeGate([{ context: 'Vercel', state: 'failure' }], young).action, 'fail');
  assert.equal(decideMergeGate([{ context: 'Vercel', state: 'error' }, { context: 'Vercel – other', state: 'success' }], young).action, 'fail');
});

test('build still running -> wait, then fail after the timeout', () => {
  assert.equal(decideMergeGate([{ context: 'Vercel', state: 'pending' }], young).action, 'wait');
  assert.equal(decideMergeGate([{ context: 'Vercel', state: 'pending' }], old).action, 'fail');
});

test('no Vercel status at all -> wait, then fail (fails closed)', () => {
  assert.equal(decideMergeGate([], young).action, 'wait');
  assert.equal(decideMergeGate([{ context: 'some-other-ci', state: 'success' }], old).action, 'fail');
});

test('the Vercel comments status does not count as a build', () => {
  assert.equal(decideMergeGate([{ context: 'Vercel Preview Comments', state: 'success' }], young).action, 'wait');
});
