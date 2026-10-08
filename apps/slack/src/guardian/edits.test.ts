import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits } from './edits.js';
import { costCents } from './llm.js';
import { noticeText } from './workflow.js';

test('applies a unique edit', () => {
  const out = applyEdits(new Map([['a.js', 'one\ntwo\nthree']]), [{ path: 'a.js', oldStr: 'two', newStr: 'TWO' }]);
  assert.equal(out.get('a.js'), 'one\nTWO\nthree');
});

test('refuses missing, duplicate and unknown-file edits', () => {
  const files = new Map([['a.js', 'x x']]);
  assert.throws(() => applyEdits(files, [{ path: 'a.js', oldStr: 'y', newStr: 'z' }]), /not found/);
  assert.throws(() => applyEdits(files, [{ path: 'a.js', oldStr: 'x', newStr: 'z' }]), /not unique/);
  assert.throws(() => applyEdits(files, [{ path: 'b.js', oldStr: 'x', newStr: 'z' }]), /did not read/);
});

test('cost meter rounds up and prices unknown models high', () => {
  assert.equal(costCents('claude-sonnet-4-6', 1_000_000, 0, 1), 300);
  assert.equal(costCents('claude-sonnet-4-6', 1, 1, 1.4), 1);
  assert.ok(costCents('mystery-model', 1_000_000, 0, 1) > 300);
});

test('notice text is safe for a WhatsApp template parameter', () => {
  assert.equal(noticeText('a\n\nb\t  c'), 'a b c');
});
