import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  AgentLogRowSchema,
  AgentLogRowsSchema,
  type AgentLogRow,
} from '@platform/shared';

/**
 * Where agent_logs rows go (§4, §6). M1 implementation is a local JSON file;
 * M2 swaps in a Supabase-backed implementation behind this same interface —
 * the orchestrator never changes.
 */
export interface LogStore {
  readonly location: string;
  append: (row: AgentLogRow) => Promise<void>;
  all: () => Promise<AgentLogRow[]>;
}

export class JsonFileLogStore implements LogStore {
  readonly location: string;
  /** Serializes writes so concurrent appends never clobber each other. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(filePath: string = '.data/agent_logs.json') {
    this.location = resolve(filePath);
  }

  async append(row: AgentLogRow): Promise<void> {
    const validated = AgentLogRowSchema.parse(row);
    const write = this.queue.then(async () => {
      const rows = await this.readAll();
      rows.push(validated);
      await mkdir(dirname(this.location), { recursive: true });
      await writeFile(
        this.location,
        `${JSON.stringify(rows, null, 2)}\n`,
        'utf8'
      );
    });
    this.queue = write.catch(() => undefined); // keep the chain alive after a failure
    await write;
  }

  async all(): Promise<AgentLogRow[]> {
    return this.readAll();
  }

  private async readAll(): Promise<AgentLogRow[]> {
    let raw: string;
    try {
      raw = await readFile(this.location, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    return AgentLogRowsSchema.parse(JSON.parse(raw));
  }
}
