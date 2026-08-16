import { z } from 'zod';
import {
  HypothesisTagSchema,
  IdSchema,
  IsoDateTimeSchema,
  PlatformSchema,
} from './primitives.js';

/** One posted video (§3 content table). Owner-entered until M3 sync. */
export const ContentRowSchema = z.object({
  id: IdSchema.optional(),
  platform: PlatformSchema,
  platformVideoId: z.string().min(1),
  title: z.string().nullable(),
  hook: z.string().nullable(),
  format: z.string().nullable(),
  hypothesis: HypothesisTagSchema.nullable(),
  postedAt: IsoDateTimeSchema,
});
export type ContentRow = z.infer<typeof ContentRowSchema>;