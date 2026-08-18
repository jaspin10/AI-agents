import { z } from 'zod';

/**
 * M4 input for the analyst agent's `analysis.next_video` capability.
 * Everything optional: a bare payload means "analyse everything, suggest freely".
 */
export const NextVideoTaskPayloadSchema = z.object({
  /** Optional owner focus, e.g. "hooks for the deadline-math angle". */
  focus: z.string().min(1).optional(),
  /** How many suggestions to produce (1–3). Default 3. */
  count: z.number().int().min(1).max(3).optional(),
});
export type NextVideoTaskPayload = z.infer<typeof NextVideoTaskPayloadSchema>;