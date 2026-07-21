'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { userHasFeature } from '@/lib/server/user-feature-grants';
import { upsertUserSchedule, type Cadence } from '@/lib/server/recurring-audits';

type Session = { userId: string; admin: ReturnType<typeof createServiceRoleClient> } | null;

async function requireAutomation(): Promise<Session> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const allowed = (await isUserPlatformAdmin(user.id, admin)) || (await userHasFeature(admin, user.id, 'automation'));
  return allowed ? { userId: user.id, admin } : null;
}

export async function saveRecurringSchedule(formData: FormData): Promise<void> {
  const session = await requireAutomation();
  if (!session) return;
  const url = String(formData.get('url') ?? '').trim();
  const cadence: Cadence = String(formData.get('cadence') ?? 'weekly') === 'daily' ? 'daily' : 'weekly';
  const enabled = String(formData.get('enabled') ?? '') === 'true';
  // Optional separate recipient for the report; empty → account email.
  const rawReportEmail = String(formData.get('reportEmail') ?? '').trim();
  const reportEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawReportEmail) ? rawReportEmail : null;
  try {
    // Reject anything that isn't a real http(s) URL before scheduling scans against it.
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
  } catch {
    return;
  }

  // Attach the user's first startup workspace, if any, so recurring scans show in that workspace.
  const { data: membership } = await session.admin
    .from('startup_workspace_users')
    .select('startup_workspace_id')
    .eq('user_id', session.userId)
    .limit(1)
    .maybeSingle();

  await upsertUserSchedule(session.admin, {
    userId: session.userId,
    startupWorkspaceId: (membership?.startup_workspace_id as string | undefined) ?? null,
    url,
    cadence,
    enabled,
    reportEmail,
    nowMs: Date.now(),
  });
  revalidatePath('/dashboard/automation');
}
