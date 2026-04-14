import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export async function createPublicContentClient(): Promise<SupabaseClient> {
  const env = await getScanApiEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env['NEXT_PUBLIC_SUPABASE_URL'] || '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env['SUPABASE_SERVICE_ROLE_KEY'] || '';
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || '';

  if (!supabaseUrl) {
    throw new Error('Server misconfigured: missing Supabase URL.');
  }

  if (serviceRoleKey) {
    return createServiceRoleClient(supabaseUrl, serviceRoleKey);
  }

  if (anonKey) {
    return createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  throw new Error('Server misconfigured: missing Supabase credentials.');
}
