import { z } from 'zod';

/**
 * Single source of truth for the CURRENT hypothesis taxonomy (M4 rule).
 * Prompts and analysis must read this list — never hard-code tag literals.
 *
 * Frozen 2026-09-10: HypothesisTagSchema stopped being a fixed enum when X1
 * replaced the H1/H2/H3 taxonomy with a per-video mechanical tag derived
 * from format/model/cta — there's no `.options` to derive this list from
 * anymore. Inlined here instead, unchanged, so agent-analyst's prompt
 * (packages/agents/analyst/src/prompts.ts) keeps saying exactly what it said
 * before — no behaviour change. Whether that prompt should be updated to
 * reflect X1's tags instead is a separate, not-yet-scoped question (X6:
 * auto-suggest hypothesis tags from Eknoor's descriptions).
 */
export const CURRENT_HYPOTHESIS_TAGS: readonly string[] = ['H1', 'H2', 'H3'];

/** Which LLM-based safety check produced a verdict (§6). */
export const CheckKindSchema = z.enum(['banned_topics', 'brand_voice']);
export type CheckKind = z.infer<typeof CheckKindSchema>;

/**
 * Zod-typed pass/fail verdict from one check on one suggestion.
 * Both verdicts are logged to agent_logs whether pass or fail (M4 rule),
 * and persisted on the suggestions row.
 */
export const CheckResultSchema = z.object({
  check: CheckKindSchema,
  passed: z.boolean(),
  /** Empty when passed; specific violated rules/topics when failed. */
  reasons: z.array(z.string()),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;
