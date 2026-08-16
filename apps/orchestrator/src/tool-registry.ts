import { ToolNotFoundError, type ToolDefinition } from '@platform/shared';

/**
 * Holds every tool the orchestrator can execute on behalf of agents.
 * Empty in M1 — read-only MCP servers register here from M3, Slack at M5.
 * No publish/write tool to any social platform may ever be registered (§6).
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition {
    const tool = this.tools.get(name);
    if (tool === undefined) throw new ToolNotFoundError(name);
    return tool;
  }

  list(): string[] {
    return [...this.tools.keys()];
  }
}
