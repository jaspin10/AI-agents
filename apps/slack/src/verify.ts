import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Slack request signature verification (v0 scheme). Every incoming Slack
 * request MUST pass this before any handler runs — it proves the request
 * came from Slack and not an arbitrary caller of the public URL.
 * Rejects requests older than 5 minutes (replay protection).
 */
export function verifySlackSignature(
  signingSecret: string,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  rawBody: string
): boolean {
  if (timestampHeader === undefined || signatureHeader === undefined) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
  if (ageSeconds > 60 * 5) return false;

  const base = `v0:${timestampHeader}:${rawBody}`;
  const expected = `v0=${createHmac('sha256', signingSecret).update(base).digest('hex')}`;

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}