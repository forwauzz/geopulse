'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { parseReportSettings, type PartialReportSettings } from '@/lib/server/report-settings';
import { saveReportOverride } from '@/lib/server/report-settings-store';

/**
 * Persist the agency-level report contents override.
 *
 * Authorization uses the caller's session; the write uses the service role, matching
 * `agency-branding-actions.ts`. This is not incidental — an UPDATE that RLS filters out returns no
 * error and affects no rows, so a user-scoped write here fails silently and the UI reports success.
 *
 * Deliberately narrow: this writes `metadata.report` and nothing else. It never touches the report
 * generator, the scheduler, or the mail path — changing what a report contains must not cause one
 * to be produced or sent.
 */
export async function saveAgencyReportSettings(
  override: PartialReportSettings
): Promise<{ ok: boolean; error?: string }> {
  const session = await createSupabaseServerClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: 'Report settings are not configured' };
  }
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: membership, error: membershipError } = await admin
    .from('agency_users')
    .select('agency_account_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (membershipError) return { ok: false, error: 'Could not read your workspace' };
  const agencyAccountId = membership?.agency_account_id;
  if (!agencyAccountId) return { ok: false, error: 'No agency workspace' };
  if (membership?.role === 'viewer') return { ok: false, error: 'Your role cannot change this' };

  // Re-validate on the server: the client is untrusted, and an unknown key must not be stored.
  const clean = parseReportSettings(override);

  try {
    await saveReportOverride({
      supabase: admin as never,
      scope: { table: 'agency_accounts', id: agencyAccountId },
      override: clean,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save' };
  }

  revalidatePath('/dashboard/workspace/report-contents');
  return { ok: true };
}
