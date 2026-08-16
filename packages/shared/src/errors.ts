import type { ZodError } from 'zod';

/** Base class for every platform error. `code` is stable and machine-readable. */
export class PlatformError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class AgentAlreadyRegisteredError extends PlatformError {
  constructor(agent: string) {
    super(
      'AGENT_ALREADY_REGISTERED',
      `Agent '${agent}' is already registered.`
    );
  }
}

export class AgentNotFoundError extends PlatformError {
  constructor(agent: string) {
    super('AGENT_NOT_FOUND', `No agent registered under name '${agent}'.`);
  }
}

/** §5: thrown when an agent attempts a tool call outside its allowedTools. */
export class ToolCallDeniedError extends PlatformError {
  constructor(agent: string, tool: string, allowedTools: readonly string[]) {
    super(
      'TOOL_CALL_DENIED',
      `Tool call denied: '${tool}' is not in allowedTools for agent '${agent}'. ` +
        `Allowed tools: ${
          allowedTools.length > 0 ? allowedTools.join(', ') : '(none)'
        }.`
    );
  }
}

export class ToolNotFoundError extends PlatformError {
  constructor(tool: string) {
    super(
      'TOOL_NOT_FOUND',
      `Tool '${tool}' is allowed but not registered with the orchestrator.`
    );
  }
}

/** Thrown when data violates a §5 contract schema (registration, input, or output). */
export class ContractViolationError extends PlatformError {
  constructor(detail: string) {
    super('CONTRACT_VIOLATION', detail);
  }
}

/** Human-readable one-liner from a ZodError, for error messages and agent_logs. */
export function formatZodError(error: ZodError): string {
  return error.issues
    .map(
      (issue) =>
        `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`
    )
    .join('; ');
}
