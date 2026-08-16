import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './primitives.js';

/** A unit of work dispatched to exactly one registered agent. */
export const TaskSchema = z.object({
  id: IdSchema,
  /** What is being asked, e.g. "analysis.echo". Must be a declared capability of the target agent. */
  type: z.string().min(1),
  /** Registered name of the target agent. */
  agent: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  /** Who asked — "owner" in M1; other agents via the bus later (§3). */
  requestedBy: z.string().min(1),
  createdAt: IsoDateTimeSchema,
});
export type Task = z.infer<typeof TaskSchema>;
