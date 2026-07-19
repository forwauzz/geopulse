'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { upsertUserSchedule, type Cadence } from '@/lib/server/recurring-audits';

/** Self-serve: any signed-in user sets up / toggles their own recurring audit from Settings. */
export async function saveMyRecurringAudit(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const url = String(formData.get('url') ?? '').trim();
  const cadence: Cadence = String(formData.get('cadence') ?? 'weekly') === 'daily' ? 'daily' : 'weekly';
  const enabled = String(formData.get('enabled') ?? '') === 'true';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
  } catch {
    return;
  }

  const { data: membership } = await admin
    .from('startup_workspace_users')
    .select('startup_workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  await upsertUserSchedule(admin, {
    userId: user.id,
    startupWorkspaceId: (membership?.startup_workspace_id as string | undefined) ?? null,
    url,
    cadence,
    enabled,
    nowMs: Date.now(),
  });
  revalidatePath('/dashboard/workspace');
}
