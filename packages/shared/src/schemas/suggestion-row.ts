import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './primitives.js';
import { SuggestionSchema } from './suggestion.js';

export const SuggestionStatusSchema = z.enum(['surfaced', 'rejected', 'posted', 'skipped']);
export type SuggestionStatus = z.infer<typeof SuggestionStatusSchema>;

/** One row of the suggestions table (migration 0003). Persisted whether surfaced or rejected. */
export const SuggestionRowSchema = z.object({
  id: IdSchema,
  runId: IdSchema,
  taskId: IdSchema,
  agent: z.string().min(1),
  kind: z.string().min(1),
  payload: SuggestionSchema,
  /** Plain string, not the enum — survives the taxonomy swap without a migration. */
  hypothesis: z.string().nullable(),
  bannedTopicsPassed: z.boolean(),
  bannedTopicsReasons: z.array(z.string()),
  brandVoicePassed: z.boolean(),
  brandVoiceReasons: z.array(z.string()),
  status: SuggestionStatusSchema,
  createdAt: IsoDateTimeSchema,
});
export type SuggestionRow = z.infer<typeof SuggestionRowSchema>;