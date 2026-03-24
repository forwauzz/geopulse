/**
 * Supabase admin client — server / Worker only, never import from client components.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createServiceRoleClient(
  url: string,
  serviceRoleKey: string
): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
