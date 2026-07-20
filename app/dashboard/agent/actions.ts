'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getAiBinding, getPaymentApiEnv, getScanApiEnv } from '@/lib/server/cf-env';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { userHasFeature } from '@/lib/server/user-feature-grants';
import { runFixAgent, type AgentFix } from '@/lib/server/fix-agent';
import { openFixAgentPrForUser } from '@/lib/server/fix-agent-pr-for-user';
import { isFixAgentAutoPrEnabled, setFixAgentAutoPr } from '@/lib/server/fix-agent-auto-pr';
import { buildAuditLlm, runFixAgentAudit } from '@/lib/server/fix-agent-run';

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
  no_target: 'No site to audit yet. Run an audit once, or set your site under Settings.',
  insert_failed: 'The audit ran but could not be saved. Try again.',
};

const PR_MESSAGES: Record<string, string> = {
  not_connected: 'Connect your GitHub repo first (Connectors → GitHub), then try again.',
  no_repo: 'No repository is enabled for this workspace yet — enable one in Connectors.',
  app_not_configured: 'GitHub App credentials are not configured on this deployment.',
  no_fixes: 'Nothing to open a PR for — run the agent first.',
  repo_list_failed: 'Could not list your repositories. Try again.',
};

function prMessage(reason: string): string {
  return PR_MESSAGES[reason] ?? `Could not open the PR (${reason}).`;
}

/** Resolve the caller and their admin client, enforcing Fix Agent access. */
async function requireFixAgentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: MESSAGES['not_allowed'] ?? 'Not allowed.' };

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false as const, message: 'Server is not configured.' };
  }
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const allowed =
    (await isUserPlatformAdmin(user.id, admin)) || (await userHasFeature(admin, user.id, 'fix_agent'));
  if (!allowed) return { ok: false as const, message: MESSAGES['not_allowed'] ?? 'Not allowed.' };

  return { ok: true as const, userId: user.id, admin, env };
}

/** Run the Fix Agent against the signed-in user's latest audit. */
export async function runFixAgentAction(
  _prev: FixAgentState,
  _formData: FormData
): Promise<FixAgentState> {
  const auth = await requireFixAgentUser();
  if (!auth.ok) return { status: 'error', message: auth.message };

  const result = await runFixAgent({
    supabase: auth.admin,
    ai: await getAiBinding(),
    userId: auth.userId,
  });
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

export type FixAgentPrState =
  | { status: 'idle' }
  | { status: 'ok'; url: string; number: number; filesWritten: string[] }
  | { status: 'error'; message: string };

/**
 * Open a PR with the agent's fixes on the user's connected repo.
 *
 * The fixes are REGENERATED SERVER-SIDE rather than accepted from the client — we never write
 * client-supplied content into someone's repository.
 */
export async function applyFixesAsPrAction(
  _prev: FixAgentPrState,
  _formData: FormData
): Promise<FixAgentPrState> {
  const auth = await requireFixAgentUser();
  if (!auth.ok) return { status: 'error', message: auth.message };

  const fresh = await runFixAgent({
    supabase: auth.admin,
    ai: await getAiBinding(),
    userId: auth.userId,
  });
  if (!fresh.ok) {
    return { status: 'error', message: MESSAGES[fresh.reason] ?? `Agent failed (${fresh.reason}).` };
  }

  const paymentEnv = await getPaymentApiEnv();
  const pr = await openFixAgentPrForUser({
    admin: auth.admin,
    appId: paymentEnv.GITHUB_APP_ID,
    privateKey: paymentEnv.GITHUB_APP_PRIVATE_KEY,
    userId: auth.userId,
    domain: fresh.domain,
    fixes: fresh.fixes,
  });
  if (!pr.ok) return { status: 'error', message: prMessage(pr.reason) };
  return { status: 'ok', url: pr.url, number: pr.number, filesWritten: pr.filesWritten };
}

// ── Complete run: audit → fixes → (optionally) the PR ─────────────────────────

export type FixAgentCompleteState =
  | { status: 'idle' }
  | {
      status: 'ok';
      domain: string;
      score: number | null;
      fixes: AgentFix[];
      /** Present only when auto-PR was authorized AND the PR opened. */
      pr: { url: string; number: number } | null;
      /** Set when auto-PR was on but the PR could not open — the run itself still succeeded. */
      prError: string | null;
      autoPrEnabled: boolean;
    }
  | { status: 'error'; message: string };

/**
 * One action for the whole job: fresh audit, fixes from it, and the pull request when the user has
 * authorized that.
 *
 * The audit is re-run rather than reusing the newest one on file, because fixes generated from a
 * stale audit can describe problems the user already solved — which is how an agent opens a PR for
 * work that is already done.
 *
 * A failed PR does NOT fail the run. The audit and the fixes are real work the user should still
 * see; reporting the whole thing as an error because GitHub was unreachable would throw away a
 * result they can still act on by hand.
 */
export async function runFixAgentCompleteAction(
  _prev: FixAgentCompleteState,
  _formData: FormData
): Promise<FixAgentCompleteState> {
  const auth = await requireFixAgentUser();
  if (!auth.ok) return { status: 'error', message: auth.message };

  const audit = await runFixAgentAudit({
    supabase: auth.admin,
    llm: buildAuditLlm(auth.env),
    userId: auth.userId,
  });
  if (!audit.ok) {
    return { status: 'error', message: MESSAGES[audit.reason] ?? `Audit failed (${audit.reason}).` };
  }

  // The audit above is now this user's newest scan, so the agent reads the fresh one.
  const fixes = await runFixAgent({
    supabase: auth.admin,
    ai: await getAiBinding(),
    userId: auth.userId,
  });
  if (!fixes.ok) {
    return { status: 'error', message: MESSAGES[fixes.reason] ?? `Agent failed (${fixes.reason}).` };
  }

  const autoPrEnabled = await isFixAgentAutoPrEnabled(auth.admin, auth.userId);
  if (!autoPrEnabled) {
    return {
      status: 'ok',
      domain: fixes.domain,
      score: fixes.score,
      fixes: fixes.fixes,
      pr: null,
      prError: null,
      autoPrEnabled: false,
    };
  }

  const paymentEnv = await getPaymentApiEnv();
  const pr = await openFixAgentPrForUser({
    admin: auth.admin,
    appId: paymentEnv.GITHUB_APP_ID,
    privateKey: paymentEnv.GITHUB_APP_PRIVATE_KEY,
    userId: auth.userId,
    domain: fixes.domain,
    fixes: fixes.fixes,
  });

  return {
    status: 'ok',
    domain: fixes.domain,
    score: fixes.score,
    fixes: fixes.fixes,
    pr: pr.ok ? { url: pr.url, number: pr.number } : null,
    prError: pr.ok ? null : prMessage(pr.reason),
    autoPrEnabled: true,
  };
}

// ── The auto-PR authorization toggle ──────────────────────────────────────────

export type AutoPrToggleState = { enabled: boolean; message: string | null };

/**
 * Set the caller's own auto-PR authorization.
 *
 * The user id comes from the session, never from the form — so this can only ever change the
 * caller's own setting.
 */
export async function setAutoPrEnabledAction(
  _prev: AutoPrToggleState,
  formData: FormData
): Promise<AutoPrToggleState> {
  const auth = await requireFixAgentUser();
  if (!auth.ok) return { enabled: false, message: auth.message };

  const enabled = formData.get('enabled') === 'true';
  const res = await setFixAgentAutoPr(auth.admin, auth.userId, enabled);
  if (!res.ok) return { enabled: !enabled, message: 'Could not save that setting. Try again.' };
  return { enabled, message: null };
}
