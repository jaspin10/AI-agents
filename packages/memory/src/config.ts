/**
 * Supabase configuration from env (§7 registry: SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, both added in M2). Both-or-neither: setting only
 * one is almost certainly a mistake, so it fails loudly instead of silently
 * falling back to JSON.
 */
export interface SupabaseConfig {
    url: string;
    serviceRoleKey: string;
  }
  
  export function readSupabaseConfig(): SupabaseConfig | null {
    const url = process.env['SUPABASE_URL']?.trim();
    const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY']?.trim();
  
    if (!url && !serviceRoleKey) return null;
  
    if (!url || !serviceRoleKey) {
      const missing = !url ? 'SUPABASE_URL' : 'SUPABASE_SERVICE_ROLE_KEY';
      const present = !url ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_URL';
      throw new Error(
        `Supabase config incomplete: ${present} is set but ${missing} is missing. ` +
          'Set both to use Supabase, or neither to use the local JSON fallback.'
      );
    }
  
    if (!/^https:\/\/.+/.test(url)) {
      throw new Error(
        `SUPABASE_URL must be an https URL (got '${url}'). ` +
          'Copy it from Supabase → Project Settings → API → Project URL.'
      );
    }
  
    return { url, serviceRoleKey };
  }