import { z } from 'zod';
import {
  HypothesisTagSchema,
  IdSchema,
  IsoDateTimeSchema,
} from './primitives.js';

const SuggestionBaseSchema = z.object({
  id: IdSchema,
  taskId: IdSchema,
  agent: z.string().min(1),
  /** Why the agent believes this is the right next move — surfaced to the owner. */
  rationale: z.string().min(1),
  createdAt: IsoDateTimeSchema,
});

/** M4: next-video suggestion (theme, hook, format, hypothesis tag) per §9. */
export const NextVideoSuggestionSchema = SuggestionBaseSchema.extend({
  kind: z.literal('next_video'),
  theme: z.string().min(1),
  hook: z.string().min(1),
  format: z.string().min(1),
  hypothesis: HypothesisTagSchema,
});
export type NextVideoSuggestion = z.infer<typeof NextVideoSuggestionSchema>;

/** M6: sales counter-offer for a given archetype + objection (e.g. demo when objection is price). */
export const CounterOfferSuggestionSchema = SuggestionBaseSchema.extend({
  kind: z.literal('counter_offer'),
  archetype: z.string().min(1),
  objection: z.string().min(1),
  offer: z.string().min(1),
});
export type CounterOfferSuggestion = z.infer<
  typeof CounterOfferSuggestionSchema
>;

/**
 * M1 only: structured echo used by the stub agent to prove contract, routing and
 * logging end to end. Remove this variant when the real analyst lands (M4).
 */
export const EchoSuggestionSchema = SuggestionBaseSchema.extend({
  kind: z.literal('echo'),
  echo: z.record(z.string(), z.unknown()),
});
export type EchoSuggestion = z.infer<typeof EchoSuggestionSchema>;

export const SuggestionSchema = z.discriminatedUnion('kind', [
  NextVideoSuggestionSchema,
  CounterOfferSuggestionSchema,
  EchoSuggestionSchema,
]);
export type Suggestion = z.infer<typeof SuggestionSchema>;
