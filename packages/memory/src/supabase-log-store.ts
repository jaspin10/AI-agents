import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  AgentLogRowSchema,
  AgentLogRowsSchema,
  type AgentLogRow,
} from '@platform/shared';
import type { LogStore } from './log-store.js';
import type { SupabaseConfig } from './config.js';

/** Maps camelCase AgentLogRow → snake_case agent_logs columns. */
function toDbRow(row: AgentLogRow): Record<string, unknown> {
  return {
    run_id: row.runId,
    task_id: row.taskId,
    agent: row.agent,
    tool: row.tool,
    status: row.status,
    input: row.input ?? null,
    output: row.output ?? null,
    error: row.error,
    started_at: row.startedAt,
    finished_at: row.finishedAt,
  };
}

/** Maps a snake_case agent_logs row → AgentLogRow, validated with Zod. */
function fromDbRow(db: Record<string, unknown>): AgentLogRow {
  return AgentLogRowSchema.parse({
    runId: db['run_id'],
    taskId: db['task_id'],
    agent: db['agent'],
    tool: db['tool'],
    status: db['status'],
    input: db['input'],
    output: db['output'],
    error: db['error'],
    startedAt: new Date(String(db['started_at'])).toISOString(),
    finishedAt: new Date(String(db['finished_at'])).toISOString(),
  });
}

/**
 * Supabase-backed agent_logs (§4, §6) behind the same LogStore interface as
 * JsonFileLogStore — zero orchestrator changes (M1 seam).
 */
export class SupabaseLogStore implements LogStore {
  readonly location: string;
  private readonly client: SupabaseClient;

  constructor(config: SupabaseConfig) {
    this.location = `${config.url} → table agent_logs`;
    this.client = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  async append(row: AgentLogRow): Promise<void> {
    const validated = AgentLogRowSchema.parse(row);
    const { error } = await this.client
      .from('agent_logs')
      .insert(toDbRow(validated));
    if (error !== null) {
      throw new Error(
        `Supabase agent_logs insert failed: ${error.message} (code ${error.code}).`
      );
    }
  }

  async all(): Promise<AgentLogRow[]> {
    const { data, error } = await this.client
      .from('agent_logs')
      .select('*')
      .order('started_at', { ascending: true });
    if (error !== null) {
      throw new Error(
        `Supabase agent_logs select failed: ${error.message} (code ${error.code}).`
      );
    }
    const rows = (data ?? []).map((entry) =>
      fromDbRow(entry as Record<string, unknown>)
    );
    return AgentLogRowsSchema.parse(rows);
  }
}