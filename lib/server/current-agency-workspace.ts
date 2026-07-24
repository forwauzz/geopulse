import { getScanApiEnv } from './cf-env';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getAgencyDashboardData, type AgencyDashboardData } from './agency-dashboard-data';

export async function loadCurrentAgencyWorkspace(args: {
  readonly userId: string;
  readonly supabase: { from(table: string): any };
  readonly selectedAccountId?: string | null;
  readonly selectedClientId?: string | null;
}): Promise<{ readonly admin: { from(table: string): any }; readonly data: AgencyDashboardData } | null> {
  const env = await getScanApiEnv();
  const admin =
    env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      : args.supabase;
  const data = await getAgencyDashboardData({
    supabase: args.supabase,
    userId: args.userId,
    selectedAccountId: args.selectedAccountId,
    selectedClientId: args.selectedClientId,
  });
  return data.accounts.length > 0 ? { admin, data } : null;
}
