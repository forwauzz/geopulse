'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getAiBinding, getScanApiEnv } from '@/lib/server/cf-env';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { userHasFeature } from '@/lib/server/user-feature-grants';
import { runFixAgent, type AgentFix } from '@/lib/server/fix-agent';

export type FixAgentState =
  | { status: 'idle' }
  | { status: 'ok'; fixes: AgentFix[]; domain: string; score: number | null; scanId: string }
  | { status: 'error'; message: string };

const MESSAGES: Record<string, string> = {
  no_scan: 'Run an audit first — the agent works from your most recent scan.',
  nothing_to_fix: 'Nothing to fix — your latest audit had no failed checks.',
  no_fixes_parsed: 'The agent could not produce clean fixes this time. Try again.',
  workers_ai_binding_missing: 'The AI engine is not available in this environment.',
  not_allowed: 'You do not have access to the Fix Agent.',
};

/** Run the Fix Agent against the signed-in user's latest audit. */
export async function runFixAgentAction(
  _prev: FixAgentState,
  _formData: FormData
): Promise<FixAgentState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: MESSAGES['not_allowed'] ?? 'Not allowed.' };

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { status: 'error', message: 'Server is not configured.' };
  }
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const allowed =
    (await isUserPlatformAdmin(user.id, admin)) || (await userHasFeature(admin, user.id, 'fix_agent'));
  if (!allowed) return { status: 'error', message: MESSAGES['not_allowed'] ?? 'Not allowed.' };

  const result = await runFixAgent({ supabase: admin, ai: await getAiBinding(), userId: user.id });
  if (!result.ok) {
    return { status: 'error', message: MESSAGES[result.reason] ?? `Agent failed (${result.reason}).` };
  }
  return {
    status: 'ok',
    fixes: result.fixes,
    domain: result.domain,
    score: result.score,
    scanId: result.scanId,
  };
}
