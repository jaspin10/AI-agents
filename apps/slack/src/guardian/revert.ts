/**
 * Auto-revert rule locked by Jas 2026-10-08 (docs/spec/guardian.md):
 * watch for 2 hours after each merge; revert if EITHER
 *   - the same error happens again, even once, OR
 *   - new errors in the watch window are at least double the errors in the
 *     2 hours before the merge, AND there are at least 3 new errors.
 * Pure function so it is unit-tested.
 */

export interface WatchCounts {
  /** Occurrences of the repaired incident since the merge. */
  sameSinceMerge: number;
  /** All Guardian error occurrences since the merge (any incident). */
  totalSinceMerge: number;
  /** All Guardian error occurrences in the 2 hours before the merge. */
  totalBeforeMerge: number;
}

export type WatchDecision =
  | { action: 'revert'; reason: string }
  | { action: 'keep' }
  | { action: 'wait' };

export const MIN_NEW_ERRORS = 3;

export function decideWatch(counts: WatchCounts, now: number, watchUntil: number): WatchDecision {
  if (counts.sameSinceMerge >= 1) {
    return { action: 'revert', reason: `the same error happened again (${counts.sameSinceMerge} time${counts.sameSinceMerge === 1 ? '' : 's'}) after the fix` };
  }
  if (counts.totalSinceMerge >= MIN_NEW_ERRORS && counts.totalSinceMerge >= 2 * counts.totalBeforeMerge) {
    return { action: 'revert', reason: `errors went up after the fix (${counts.totalSinceMerge} since, ${counts.totalBeforeMerge} in the 2 hours before)` };
  }
  return now >= watchUntil ? { action: 'keep' } : { action: 'wait' };
}
