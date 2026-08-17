import { createLogger } from '@platform/shared';
import { JsonFileLogStore, type LogStore } from './log-store.js';
import { readSupabaseConfig, type SupabaseConfig } from './config.js';
import { SupabaseLogStore } from './supabase-log-store.js';
import { createMemoryClientFromConfig, type MemoryClient } from './client.js';

export { JsonFileLogStore, type LogStore } from './log-store.js';
export { readSupabaseConfig, type SupabaseConfig } from './config.js';
export { SupabaseLogStore } from './supabase-log-store.js';
export { createMemoryClientFromConfig, type MemoryClient } from './client.js';

/**
 * Selects the LogStore implementation from the environment (§8 M1 decision:
 * the orchestrator depends only on the LogStore interface). With
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set → SupabaseLogStore;
 * with neither → JsonFileLogStore, so `pnpm demo` passes with zero setup.
 */
export function createLogStore(): LogStore {
  const logger = createLogger('memory');
  const config: SupabaseConfig | null = readSupabaseConfig();
  if (config === null) {
    logger.info('no Supabase config found — using local JSON log store');
    return new JsonFileLogStore();
  }
  logger.info('Supabase config found — using Supabase log store');
  return new SupabaseLogStore(config);
}

/**
 * Typed table helpers (brand_assets, content, performance, conversations,
 * enrollments, demo_log — §3). Requires Supabase env vars — there is no JSON
 * fallback for memory tables, only for agent_logs.
 */
export function createMemoryClient(): MemoryClient {
  const config = readSupabaseConfig();
  if (config === null) {
    throw new Error(
      'createMemoryClient requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. ' +
        'Only agent_logs has a local JSON fallback (§8 M1 seam).'
    );
  }
  return createMemoryClientFromConfig(config);
}