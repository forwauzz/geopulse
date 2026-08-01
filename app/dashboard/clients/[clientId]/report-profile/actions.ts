'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { parseReportSettings, type PartialReportSettings } from '@/lib/server/report-settings';
import { saveReportOverride } from '@/lib/server/report-settings-store';

export async function saveClientReportSettings(
  clientId: string,
  override: PartialReportSettings
): Promise<{ ok: boolean; error?: string }> {
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: 'Report settings are not configured' };
  }
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: membership } = await admin
    .from('agency_users')
    .select('agency_account_id,role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (!membership?.agency_account_id || membership.role === 'viewer') {
    return { ok: false, error: 'Your role cannot change this report' };
  }
  const { data: client } = await admin
    .from('agency_clients')
    .select('id')
    .eq('id', clientId)
    .eq('agency_account_id', membership.agency_account_id)
    .maybeSingle();
  if (!client?.id) return { ok: false, error: 'Client not found' };
  try {
    await saveReportOverride({
      supabase: admin as never,
      scope: { table: 'agency_clients', id: clientId },
      override: parseReportSettings(override),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save' };
  }
  revalidatePath(`/dashboard/clients/${clientId}/report-profile`);
  return { ok: true };
}
