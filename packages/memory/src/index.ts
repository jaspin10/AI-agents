export { JsonFileLogStore, type LogStore } from './log-store.js';

/**
 * Supabase + pgvector memory layer (brand_assets, content, performance,
 * conversations, enrollments, demo_log — §3) lands in Milestone 2.
 */
export function createMemoryClient(): never {
  throw new Error(
    'Memory layer not implemented yet: Supabase + pgvector arrives in Milestone 2 (spec §9).'
  );
}
