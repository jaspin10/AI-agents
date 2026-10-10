import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_TOKEN_ESTIMATE, buildUserContent, estimateInputTokens, estimateTokens } from './llm.js';
import { Portal, ScreenshotSchema, type Incident } from './portal.js';
import { loadScreenshot } from './workflow.js';

const logger = { info() {}, warn() {}, error() {}, debug() {} } as never;
const base = { id: 'abcd1234-0000', fingerprint: 'f', feature: null, route: null, operation: null, normalized_error_type: null, sample_message: null, severity: null, status: 'TRIGGERED', occurrence_count: 1, distinct_student_count: 0, first_seen: null, last_seen: null, triggered_at: null };

function portalReturning(reply: unknown, calls: string[] = []): Portal {
  return new Portal(async (action) => { calls.push(action); if (reply instanceof Error) throw reply; return reply; });
}

test('the image goes in the user turn, before the text that labels it untrusted', () => {
  const content = buildUserContent('label', { mediaType: 'image/png', data: 'AAAA' });
  assert.ok(Array.isArray(content));
  assert.equal((content as Array<{ type: string }>)[0]?.type, 'image');
  assert.equal((content as Array<{ type: string }>)[1]?.type, 'text');
  assert.equal(buildUserContent('label'), 'label');
});

test('a screenshot is reserved against the AI cap', () => {
  assert.equal(estimateInputTokens('s', 'u', { mediaType: 'image/jpeg', data: 'AAAA' }), estimateTokens('su') + IMAGE_TOKEN_ESTIMATE);
  assert.equal(estimateInputTokens('s', 'u'), estimateTokens('su'));
});

test('only staff_report incidents ask for a screenshot', async () => {
  const calls: string[] = [];
  const out = await loadScreenshot({ portal: portalReturning({ ok: true, media_type: 'image/png', data: 'AAAA', bytes: 3 }, calls), logger }, { ...base, trigger_reason: 'B' } as Incident);
  assert.equal(out.image, undefined);
  assert.deepEqual(calls, []);
});

test('a staff_report screenshot is attached', async () => {
  const out = await loadScreenshot({ portal: portalReturning({ ok: true, media_type: 'image/png', data: 'AAAA', bytes: 3 }), logger }, { ...base, trigger_reason: 'staff_report' } as Incident);
  assert.deepEqual(out.image, { mediaType: 'image/png', data: 'AAAA' });
  assert.equal(out.note, 'attached');
});

test('no screenshot or a failed fetch never stops the investigation', async () => {
  const inc = { ...base, trigger_reason: 'staff_report' } as Incident;
  assert.equal((await loadScreenshot({ portal: portalReturning({ ok: false, error: 'no_screenshot' }), logger }, inc)).note, 'none: no_screenshot');
  assert.equal((await loadScreenshot({ portal: portalReturning(new Error('boom')), logger }, inc)).note, 'none: fetch failed');
  assert.equal((await loadScreenshot({ portal: portalReturning({ ok: true, media_type: 'image/gif', data: 'AAAA', bytes: 3 }), logger }, inc)).image, undefined);
});

test('the screenshot schema rejects odd types and non-base64 data', () => {
  assert.equal(ScreenshotSchema.safeParse({ ok: true, media_type: 'image/svg+xml', data: 'AAAA', bytes: 3 }).success, false);
  assert.equal(ScreenshotSchema.safeParse({ ok: true, media_type: 'image/png', data: 'AA AA<', bytes: 3 }).success, false);
  assert.equal(ScreenshotSchema.safeParse({ ok: true, media_type: 'image/png', data: 'AAAA', bytes: 3 }).success, true);
});
