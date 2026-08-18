import { z } from 'zod';
import { HypothesisTagSchema } from './primitives.js';

/**
 * Single source of truth for the CURRENT hypothesis taxonomy (M4 rule).
 * Prompts and analysis must read this list — never hard-code tag literals.
 * When the owner's taxonomy v2 lands, edit HypothesisTagSchema in
 * primitives.ts and everything downstream follows.
 */
export const CURRENT_HYPOTHESIS_TAGS: readonly string[] =
  HypothesisTagSchema.options;

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