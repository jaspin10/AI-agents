import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './primitives.js';

/** KPI 2 baseline: one manually logged demo send. */
export const DemoLogRowSchema = z.object({
  id: IdSchema.optional(),
  pseudonym: z.string().min(1),
  sentAt: IsoDateTimeSchema,
  channel: z.string().nullable(),
  converted: z.boolean().nullable(),
  convertedAt: IsoDateTimeSchema.nullable(),
});
export type DemoLogRow = z.infer<typeof DemoLogRowSchema>;