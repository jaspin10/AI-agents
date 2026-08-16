import { randomUUID } from 'node:crypto';
import { ZodError, type ZodType } from 'zod';
import {
  ContractViolationError,
  PlatformError,
  TaskSchema,
  ToolCallDeniedError,
  createLogger,
  formatZodError,
  type AgentContract,
  type AgentLogRow,
  type DispatchResult,
  type Logger,
  type Task,
  type ToolDefinition,
} from '@platform/shared';
import type { LogStore } from '@platform/memory';
import { AgentRegistry } from './registry.js';
import { ToolRegistry } from './tool-registry.js';

export interface OrchestratorOptions {
  logStore: LogStore;
  logger?: Logger;
}

/**
 * Dispatches tasks to registered agents and enforces the §5 contract at runtime:
 * declared capability → payload valid per inputSchema → run → result valid per
 * outputSchema. Every tool call is checked against the agent's allowedTools
 * BEFORE tool lookup, so a denial is always the §5 error. Every run and every
 * tool attempt writes an agent_logs row (§4, §6).
 */
export class Orchestrator {
  private readonly agents = new AgentRegistry();
  private readonly tools = new ToolRegistry();
  private readonly logStore: LogStore;
  private readonly logger: Logger;

  constructor(options: OrchestratorOptions) {
    this.logStore = options.logStore;
    this.logger = options.logger ?? createLogger('orchestrator');
  }

  registerAgent(candidate: unknown): AgentContract {
    const contract = this.agents.register(candidate);
    this.logger.info(
      `registered agent '${contract.name}' (capabilities: ${
        contract.capabilities.join(', ') || 'none'
      }; ` + `allowedTools: ${contract.allowedTools.join(', ') || 'none'})`
    );
    return contract;
  }

  registerTool(tool: ToolDefinition): void {
    this.tools.register(tool);
    this.logger.info(`registered tool '${tool.name}'`);
  }

  listAgents(): string[] {
    return this.agents.list();
  }

  listTools(): string[] {
    return this.tools.list();
  }

  /** Never throws — failures come back as a structured DispatchResult and are logged. */
  async dispatch(taskInput: unknown): Promise<DispatchResult> {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    let task: Task | null = null;

    try {
      const parsedTask = this.parseWith(TaskSchema, taskInput, 'TaskSchema');
      task = parsedTask;
      const agent = this.agents.get(parsedTask.agent);

      if (!agent.capabilities.includes(parsedTask.type)) {
        throw new ContractViolationError(
          `Agent '${agent.name}' does not declare capability '${parsedTask.type}' ` +
            `(capabilities: ${agent.capabilities.join(', ') || 'none'}).`
        );
      }

      this.parseWith(
        agent.inputSchema,
        parsedTask.payload,
        `inputSchema of agent '${agent.name}'`
      );

      const context = {
        runId,
        logger: this.logger.child(`run:${agent.name}`),
        callTool: (tool: string, input: unknown) =>
          this.executeToolCall(runId, parsedTask, agent, tool, input),
      };

      const rawOutput = await agent.run(parsedTask, context);
      const output = this.parseWith(
        agent.outputSchema,
        rawOutput,
        `outputSchema of agent '${agent.name}'`
      );

      await this.writeLog({
        runId,
        taskId: parsedTask.id,
        agent: agent.name,
        tool: 'agent.run',
        status: 'ok',
        input: parsedTask,
        output,
        error: null,
        startedAt,
        finishedAt: new Date().toISOString(),
      });

      return { ok: true, runId, taskId: parsedTask.id, output };
    } catch (error) {
      const failure = toFailure(error);
      const status =
        error instanceof ToolCallDeniedError ? 'rejected' : 'error';
      await this.writeLog(
        {
          runId,
          taskId: task?.id ?? null,
          agent: task?.agent ?? 'unknown',
          tool: 'agent.run',
          status,
          input: taskInput,
          output: null,
          error: `${failure.name} (${failure.code}): ${failure.message}`,
          startedAt,
          finishedAt: new Date().toISOString(),
        },
        { swallowErrors: true }
      );
      this.logger.warn(`dispatch failed [${failure.code}]: ${failure.message}`);
      return { ok: false, runId, taskId: task?.id ?? null, error: failure };
    }
  }

  /** §5 enforcement point: every tool call from every agent lands here. */
  private async executeToolCall(
    runId: string,
    task: Task,
    agent: AgentContract,
    tool: string,
    input: unknown
  ): Promise<unknown> {
    const startedAt = new Date().toISOString();

    if (!agent.allowedTools.includes(tool)) {
      const denial = new ToolCallDeniedError(
        agent.name,
        tool,
        agent.allowedTools
      );
      await this.writeLog({
        runId,
        taskId: task.id,
        agent: agent.name,
        tool,
        status: 'rejected',
        input,
        output: null,
        error: denial.message,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
      this.logger.warn(denial.message);
      throw denial;
    }

    try {
      const definition = this.tools.get(tool); // ToolNotFoundError if allowed but unregistered
      const parsedInput = this.parseWith(
        definition.inputSchema,
        input,
        `inputSchema of tool '${tool}'`
      );
      const rawResult = await definition.execute(parsedInput);
      const output = this.parseWith(
        definition.outputSchema,
        rawResult,
        `outputSchema of tool '${tool}'`
      );
      await this.writeLog({
        runId,
        taskId: task.id,
        agent: agent.name,
        tool,
        status: 'ok',
        input,
        output,
        error: null,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
      return output;
    } catch (error) {
      const failure = toFailure(error);
      await this.writeLog({
        runId,
        taskId: task.id,
        agent: agent.name,
        tool,
        status: 'error',
        input,
        output: null,
        error: `${failure.name} (${failure.code}): ${failure.message}`,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  private parseWith<T>(schema: ZodType<T>, value: unknown, label: string): T {
    try {
      return schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ContractViolationError(
          `${label} rejected the value — ${formatZodError(error)}`
        );
      }
      throw error;
    }
  }

  private async writeLog(
    row: AgentLogRow,
    options?: { swallowErrors?: boolean }
  ): Promise<void> {
    try {
      await this.logStore.append(row);
    } catch (error) {
      if (options?.swallowErrors === true) {
        this.logger.error(
          `failed to write agent_logs row: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return;
      }
      throw error;
    }
  }
}

function toFailure(error: unknown): {
  name: string;
  code: string;
  message: string;
} {
  if (error instanceof PlatformError)
    return { name: error.name, code: error.code, message: error.message };
  if (error instanceof Error)
    return { name: error.name, code: 'UNEXPECTED', message: error.message };
  return { name: 'UnknownError', code: 'UNEXPECTED', message: String(error) };
}
