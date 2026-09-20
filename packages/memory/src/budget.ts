import { createClient } from '@supabase/supabase-js';
import { createLlmClient, withCallBudget, type LlmClient } from '@platform/shared';
import { readSupabaseConfig } from './config.js';

/** Same existing vendor/model. No config/key/cap/reservation service => no paid call. */
export function createReservedLlm(runId: string, agent: string): LlmClient | null {
  const raw = createLlmClient();
  if (!raw) return null;
  const config = readSupabaseConfig();
  const cap = Number(process.env['LLM_MONTHLY_CAP']);
  if (!config || !Number.isSafeInteger(cap) || cap <= 0) return null;
  const db = createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false } });
  return withCallBudget(raw, {
    async reserve(id, tokens) {
      const { error } = await db.rpc('reserve_llm_call', { p_id: id, p_tokens: tokens, p_cap: cap });
      if (error) throw new Error('LLM budget unavailable or exhausted; no call made');
    },
    async settle(id, result) {
      const { error } = await db.rpc('settle_llm_call', { p_id: id, p_run: runId, p_agent: agent, p_model: result.model,
        p_input: result.usage.inputTokens, p_output: result.usage.outputTokens });
      if (error) throw new Error('LLM accounting unavailable; reservation retained');
    },
  });
}
