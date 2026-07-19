'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { upsertUserSchedule, runUserAuditNow, type Cadence } from '@/lib/server/recurring-audits';

/** Self-serve: any signed-in user sets up / toggles their own recurring audit from Settings. */
export async function saveMyRecurringAudit(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const env = await getPaymentApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const url = String(formData.get('url') ?? '').trim();
  const cadence: Cadence = String(formData.get('cadence') ?? 'weekly') === 'daily' ? 'daily' : 'weekly';
  const enabled = String(formData.get('enabled') ?? '') === 'true';
  const reportEmail = String(formData.get('reportEmail') ?? '').trim() || null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
  } catch {
    redirect('/dashboard/workspace?recurring=bad_url');
  }

  const { data: membership } = await admin
    .from('startup_workspace_users')
    .select('startup_workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const res = await upsertUserSchedule(admin, {
    userId: user.id,
    startupWorkspaceId: (membership?.startup_workspace_id as string | undefined) ?? null,
    url,
    cadence,
    enabled,
    reportEmail,
    nowMs: Date.now(),
  });
  revalidatePath('/dashboard/workspace');
  redirect(`/dashboard/workspace?recurring=${res.ok ? 'saved' : 'error'}`);
}

/** "Run now / test": run the user's schedule once immediately and email the report. */
export async function runMyRecurringAuditNow(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const env = await getPaymentApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const result = await runUserAuditNow(admin, env, user.id, Date.now());
  revalidatePath('/dashboard/workspace');
  if (result.ok) redirect(`/results/${result.scanId}`);
  redirect(`/dashboard/workspace?recurring=run_${result.reason}`);
}
