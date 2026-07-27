import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from './cf-env';

/**
 * The standalone $39 monitoring offer belongs to individual-business scans. An agency-linked
 * client is already governed by the agency subscription and must never see a contradictory
 * second checkout.
 */
export async function scanCanShowStandaloneMonitoringOffer(scanId: string): Promise<boolean> {
  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await admin
    .from('scans')
    .select('agency_account_id,agency_client_id')
    .eq('id', scanId)
    .maybeSingle();
  if (!data) return false;
  return !data.agency_account_id && !data.agency_client_id;
}
