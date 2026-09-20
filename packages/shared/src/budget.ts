import { randomUUID } from 'node:crypto';
import type { LlmClient, LlmResult } from './llm.js';

export interface CallBudget {
  reserve: (id: string, tokens: number) => Promise<void>;
  settle: (id: string, result: LlmResult) => Promise<void>;
}
/** Conservative byte bound, plus protocol overhead and maximum completion.
 * Fail closed before the network call. Failed/uncertain calls retain reservation.
 * Every application retry receives a new reservation. SDK retries are disabled. */
export function withCallBudget(client: LlmClient, budget: CallBudget): LlmClient {
  return { async complete(options) {
    const maxTokens = options.maxTokens ?? 2048;
    const bytes = Buffer.byteLength(options.system + options.user, 'utf8');
    if (bytes > 120000 || maxTokens > 8192 || maxTokens < 1) throw new Error('prompt_budget_limit');
    const id = randomUUID();
    await budget.reserve(id, bytes + maxTokens + 4096);
    const result = await client.complete(options);
    await budget.settle(id, result);
    return result;
  } };
}
