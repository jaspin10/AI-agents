import { createLogger } from '@platform/shared';
import { JsonFileLogStore, type LogStore } from './log-store.js';
import { readSupabaseConfig, type SupabaseConfig } from './config.js';
import { SupabaseLogStore } from './supabase-log-store.js';

export { JsonFileLogStore, type LogStore } from './log-store.js';
export { readSupabaseConfig, type SupabaseConfig } from './config.js';
export { SupabaseLogStore } from './supabase-log-store.js';

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
 * enrollments, demo_log — §3). Real implementation lands in Step 5.
 */
export function createMemoryClient(): never {
  throw new Error('createMemoryClient lands in Step 5 of Milestone 2.');
}