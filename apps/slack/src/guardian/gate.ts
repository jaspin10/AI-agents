/**
 * Build gate (Jas decision 2026-10-08, replaces "small fixes merge with no checks"):
 * a Guardian PR is merged only after Vercel's preview build for the PR's head commit
 * has passed. Pure function so it is unit-tested.
 *
 * Fails CLOSED: a failed build, no build result within the timeout, or statuses
 * Guardian cannot read all mean "do not merge".
 */

export interface CommitStatus {
  context: string;
  state: string;
}

export type GateDecision =
  | { action: 'merge' }
  | { action: 'wait' }
  | { action: 'fail'; reason: string };

export const BUILD_TIMEOUT_MS = 30 * 60 * 1000;

function isVercelBuild(context: string): boolean {
  return /^vercel/i.test(context) && !/comment/i.test(context);
}

export function decideMergeGate(statuses: CommitStatus[], prAgeMs: number, timeoutMs: number = BUILD_TIMEOUT_MS): GateDecision {
  const builds = statuses.filter((s) => isVercelBuild(s.context));
  if (builds.some((s) => s.state === 'failure' || s.state === 'error')) {
    return { action: 'fail', reason: 'the Vercel build of the fix failed' };
  }
  if (builds.length > 0 && builds.every((s) => s.state === 'success')) {
    return { action: 'merge' };
  }
  if (prAgeMs > timeoutMs) {
    return { action: 'fail', reason: `no passing Vercel build after ${Math.round(timeoutMs / 60000)} minutes` };
  }
  return { action: 'wait' };
}
