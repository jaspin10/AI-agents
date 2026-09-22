import { createClient } from '@supabase/supabase-js';
import { ConfirmedBrainLineageSchema, type ConfirmedBrainLineage } from '@platform/shared';
import { readSupabaseConfig } from './config.js';

export interface BrainLineageStore {
  recent(): Promise<ConfirmedBrainLineage[]>;
  forContent(contentId: string): Promise<ConfirmedBrainLineage[]>;
}
/** Read-only projections of X14. No new relationship, permission, or publishing path. */
export function createBrainLineageStore(): BrainLineageStore {
  const config = readSupabaseConfig();
  if (!config || new URL(config.url).hostname === 'jtzazvkshizmuhezuxwl.supabase.co') throw new Error('Analyst database required');
  const db = createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false } });
  const columns = 'id,production_id,brief_id,brief_version,content_uuid,asset_version,asset_fingerprint,confirmed_at,confirmed_by';
  return {
    async recent() {
      const { data, error } = await db.from('production_lineage').select(columns).order('confirmed_at', { ascending: false }).limit(500);
      if (error) throw new Error('lineage_unavailable');
      return (data ?? []).map(row => ConfirmedBrainLineageSchema.parse(row));
    },
    async forContent(id) {
      const { data, error } = await db.from('production_lineage').select(columns).eq('content_uuid', id).order('confirmed_at', { ascending: false });
      if (error) throw new Error('lineage_unavailable');
      return (data ?? []).map(row => ConfirmedBrainLineageSchema.parse(row));
    },
  };
}
