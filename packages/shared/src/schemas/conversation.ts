import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './primitives.js';

export const ConversationOutcomeSchema = z.enum([
  'enrolled',
  'lost',
  'pending',
]);
export type ConversationOutcome = z.infer<typeof ConversationOutcomeSchema>;

/**
 * §6 privacy: pseudonymized BEFORE storage — pseudonym like 'lead-0042',
 * never a real name or contact detail. Full analysis lands in M6.
 */
export const ConversationRowSchema = z.object({
  id: IdSchema.optional(),
  pseudonym: z.string().min(1),
  archetype: z.string().nullable(),
  objection: z.string().nullable(),
  outcome: ConversationOutcomeSchema.nullable(),
  summary: z.string().nullable(),
  occurredAt: IsoDateTimeSchema.nullable(),
});
export type ConversationRow = z.infer<typeof ConversationRowSchema>;