import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './primitives.js';

export const AgentLogStatusSchema = z.enum(['ok', 'rejected', 'error']);
export type AgentLogStatus = z.infer<typeof AgentLogStatusSchema>;

/**
 * One auditable action (§4, §6). `tool` is "agent.run" for the agent invocation
 * itself, otherwise the tool name. `status: "rejected"` marks allowedTools denials.
 */
export const AgentLogRowSchema = z.object({
  runId: IdSchema,
  taskId: IdSchema.nullable(),
  agent: z.string().min(1),
  tool: z.string().min(1),
  status: AgentLogStatusSchema,
  input: z.unknown(),
  output: z.unknown(),
  error: z.string().nullable(),
  startedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema,
});
export type AgentLogRow = z.infer<typeof AgentLogRowSchema>;

export const AgentLogRowsSchema = z.array(AgentLogRowSchema);
