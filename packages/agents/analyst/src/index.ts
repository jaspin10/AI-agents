import { randomUUID } from 'node:crypto';
import {
  AgentContractSchema,
  EchoSuggestionSchema,
  EchoTaskPayloadSchema,
  type AgentContext,
  type AgentContract,
  type EchoSuggestion,
  type Task,
} from '@platform/shared';

export const ANALYST_AGENT_NAME = 'analyst';

async function run(task: Task, context: AgentContext): Promise<EchoSuggestion> {
  const payload = EchoTaskPayloadSchema.parse(task.payload);

  if (payload.attemptTool !== undefined) {
    context.logger.info(
      `attempting tool call '${payload.attemptTool}' — the router must decide`
    );
    // Routed through the orchestrator; with allowedTools: [] this must throw
    // ToolCallDeniedError before anything executes (§5).
    await context.callTool(payload.attemptTool, {
      note: 'this must never execute in M1',
    });
  }

  return {
    id: randomUUID(),
    taskId: task.id,
    agent: ANALYST_AGENT_NAME,
    kind: 'echo',
    rationale:
      'M1 stub: echoes the task payload as a structured Suggestion to prove contract, routing and logging end to end. Real analysis (Claude Agent SDK) lands in M4.',
    echo: payload,
    createdAt: new Date().toISOString(),
  };
}

/**
 * §5 contract instance for the marketing/sales analyst — M1 stub.
 * allowedTools is deliberately empty: this agent cannot reach any integration,
 * and no publish tool exists anywhere in the codebase (§6).
 */
export const analystAgent: AgentContract = AgentContractSchema.parse({
  name: ANALYST_AGENT_NAME,
  description:
    'Marketing & sales analyst (M1 stub). Echoes tasks as Suggestions; no tools, no LLM.',
  capabilities: ['analysis.echo'],
  allowedTools: [],
  inputSchema: EchoTaskPayloadSchema,
  outputSchema: EchoSuggestionSchema,
  run,
} satisfies AgentContract);
