import { z } from 'zod';
import type { AgentRunFn } from '../types.js';

const isZodSchema = (value: unknown): value is z.ZodType =>
  value instanceof z.ZodType;

/**
 * §5 Agent Contract v1. Validated once at registration. The router then enforces
 * inputSchema/outputSchema on every dispatch and allowedTools on every tool call.
 */
export const AgentContractSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(
      /^[a-z][a-z0-9._-]*$/,
      "agent name must be lowercase (a-z, 0-9, '.', '_', '-')"
    ),
  description: z.string().min(1),
  capabilities: z.array(z.string().min(1)),
  allowedTools: z.array(z.string().min(1)),
  inputSchema: z.custom<z.ZodType>(
    isZodSchema,
    'inputSchema must be a Zod schema'
  ),
  outputSchema: z.custom<z.ZodType>(
    isZodSchema,
    'outputSchema must be a Zod schema'
  ),
  run: z.custom<AgentRunFn>(
    (value) => typeof value === 'function',
    'run must be an async function'
  ),
});
export type AgentContract = z.infer<typeof AgentContractSchema>;
