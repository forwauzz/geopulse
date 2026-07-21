'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { addTrackedPrompt } from '@/lib/server/tracked-prompts';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Add a prompt to track for the signed-in user's own audited domain. The domain comes from their
 * latest scan server-side — the client never chooses which domain gets the prompt, so a user can
 * only ever add prompts against a site they actually audit.
 */
export async function addTrackedPromptAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard');

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) redirect('/dashboard?prompt=error');
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: latestScan } = await supabase
    .from('scans')
    .select('domain')
    .eq('user_id', user.id)
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const domain = (latestScan?.domain as string | undefined) ?? '';
  if (!domain) redirect('/dashboard?prompt=no_domain');

  const result = await addTrackedPrompt({
    supabase: admin,
    domain,
    queryText: String(formData.get('promptText') ?? ''),
  });

  revalidatePath('/dashboard');
  redirect(`/dashboard?prompt=${result.ok ? 'added' : result.code}`);
}
