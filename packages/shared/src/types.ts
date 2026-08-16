import type { z } from 'zod';
import type { Logger } from './logger.js';
import type { Task } from './schemas/task.js';

/**
 * The only way an agent reaches a tool. Routed through the orchestrator, which
 * enforces allowedTools (§5) before anything executes. Throws ToolCallDeniedError
 * or ToolNotFoundError.
 */
export type ToolCall = (tool: string, input: unknown) => Promise<unknown>;

/** Passed to every agent run by the orchestrator. */
export interface AgentContext {
  runId: string;
  logger: Logger;
  callTool: ToolCall;
}

export type AgentRunFn = (
  task: Task,
  context: AgentContext
) => Promise<unknown>;

/** A tool the orchestrator can execute on behalf of an agent (MCP-backed from M3). */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  execute: (input: unknown) => Promise<unknown>;
}

/** Result of Orchestrator.dispatch — never throws; failures come back structured. */
export type DispatchResult =
  | { ok: true; runId: string; taskId: string; output: unknown }
  | {
      ok: false;
      runId: string;
      taskId: string | null;
      error: { name: string; code: string; message: string };
    };
