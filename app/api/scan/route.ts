import { z } from 'zod';
import { GeminiProvider } from '@workers/providers/gemini';
import type { LLMProvider } from '@workers/lib/interfaces/providers';
import { runFreeScan } from '@workers/scan-engine/run-scan';
import { getClientIp, getScanApiEnv } from '@/lib/server/cf-env';
import { checkScanRateLimit } from '@/lib/server/rate-limit-kv';
import { resolveAgencyFeatureEntitlements, validateAgencyContext } from '@/lib/server/agency-access';
import { resolveAgencyModelPolicy } from '@/lib/server/agency-model-policy';
import { validateStartupWorkspaceScanContext } from '@/lib/server/startup-scan-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyTurnstileToken } from '@/lib/server/turnstile';
import { structuredLog } from '@/lib/server/structured-log';
import { emitMarketingEvent } from '@services/marketing-attribution/emit';
import { optionalAttributionFields } from '@services/marketing-attribution/attribution-params';

export const runtime = 'nodejs';

const bodySchema = z.object({
  url: z.string().url(),
  turnstileToken: z.string().min(1),
  agencyAccountId: z.string().uuid().nullish(),
  agencyClientId: z.string().uuid().nullish(),
  startupWorkspaceId: z.string().uuid().nullish(),
}).extend(optionalAttributionFields.shape);

class UnconfiguredLlm implements LLMProvider {
  async analyze(): Promise<{ passed: boolean; reasoning: string; confidence: 'low' }> {
    return { passed: false, reasoning: 'GEMINI_API_KEY not configured', confidence: 'low' };
  }
}

export async function POST(request: Request): Promise<Response> {
  const env = await getScanApiEnv();
  const ip = getClientIp(request);

  const rl = await checkScanRateLimit(env.SCAN_CACHE, ip);
  if (!rl.ok) {
    return Response.json(
      { error: { code: 'rate_limited', message: 'Too many scans. Try again shortly.' } },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec ?? 60) } }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: { code: 'bad_json', message: 'Invalid JSON' } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'validation_error', message: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const {
    url,
    turnstileToken,
    anonymous_id,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    referrer_url,
    landing_path,
    agencyAccountId,
    agencyClientId,
    startupWorkspaceId,
  } = parsed.data;
  const attrCtx = { anonymous_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_url, landing_path };

  const ts = await verifyTurnstileToken(env.TURNSTILE_SECRET_KEY, turnstileToken, ip);
  if (!ts.ok) {
    return Response.json(
      { error: { code: 'turnstile_failed', message: ts.error } },
      { status: 400 }
    );
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      { error: { code: 'server_misconfigured', message: 'Supabase admin not configured' } },
      { status: 503 }
    );
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const supabaseForAttr = supabase;

  let sessionUserId: string | null = null;
  let agencyContext: { agencyAccountId: string | null; agencyClientId: string | null } | null = null;
  let startupContext: { startupWorkspaceId: string } | null = null;

  if (agencyAccountId || startupWorkspaceId) {
    try {
      const sessionClient = await createSupabaseServerClient();
      const {
        data: { user },
      } = await sessionClient.auth.getUser();
      sessionUserId = user?.id ?? null;

      if (
        user?.id &&
        agencyAccountId &&
        (await validateAgencyContext({
          supabase,
          userId: user.id,
          agencyAccountId,
          agencyClientId: agencyClientId ?? null,
        }))
      ) {
        const entitlements = await resolveAgencyFeatureEntitlements({
          supabase,
          agencyAccountId,
          agencyClientId: agencyClientId ?? null,
        });
        if (!entitlements.scanLaunchEnabled) {
          structuredLog('agency_scan_launch_blocked', {
            userId: user.id,
            agencyAccountId,
            agencyClientId: agencyClientId ?? null,
          });
          return Response.json(
            {
              error: {
                code: 'agency_scan_disabled',
                message: 'Scan launch is disabled for this agency client.',
              },
            },
            { status: 403 }
          );
        }
        agencyContext = {
          agencyAccountId,
          agencyClientId: agencyClientId ?? null,
        };
        structuredLog(
          'agency_scan_context_resolved',
          {
            userId: user.id,
            agencyAccountId,
            agencyClientId: agencyClientId ?? null,
          },
          'info'
        );
      }

      if (
        !agencyContext &&
        user?.id &&
        startupWorkspaceId &&
        (await validateStartupWorkspaceScanContext({
          supabase,
          userId: user.id,
          startupWorkspaceId,
        }))
      ) {
        startupContext = { startupWorkspaceId };
        structuredLog(
          'startup_scan_context_resolved',
          { userId: user.id, startupWorkspaceId },
          'info'
        );
      }
    } catch {
      agencyContext = null;
      startupContext = null;
    }
  }

  const scanModelPolicy = await resolveAgencyModelPolicy({
    supabase,
    agencyAccountId: agencyContext?.agencyAccountId ?? null,
    agencyClientId: agencyContext?.agencyClientId ?? null,
    productSurface: 'free_scan',
    fallbackProvider: 'gemini',
    fallbackModelId: env.GEMINI_MODEL,
  });

  const llm: LLMProvider = env.GEMINI_API_KEY
    ? new GeminiProvider({
        GEMINI_API_KEY: env.GEMINI_API_KEY,
        GEMINI_MODEL: scanModelPolicy.effectiveModel,
        GEMINI_ENDPOINT: env.GEMINI_ENDPOINT,
      })
    : new UnconfiguredLlm();

  await emitMarketingEvent(supabaseForAttr, 'scan_started', { ...attrCtx, metadata: { url } });

  const scan = await runFreeScan(url, llm);
  if (!scan.ok) {
    return Response.json({ error: { code: 'scan_failed', message: scan.reason } }, { status: 400 });
  }

  const runSource = agencyContext
    ? 'agency_dashboard'
    : startupContext
      ? 'startup_dashboard'
      : 'public_self_serve';

  const { data: row, error } = await supabase
    .from('scans')
    .insert({
      url: scan.finalUrl,
      domain: scan.domain,
      status: 'complete',
      score: scan.output.score,
      letter_grade: scan.output.letterGrade,
      issues_json: scan.output.issues,
      full_results_json: { issues: scan.output.issues, categoryScores: scan.output.categoryScores },
      user_id: agencyContext || startupContext ? sessionUserId : null,
      agency_account_id: agencyContext?.agencyAccountId ?? null,
      agency_client_id: agencyContext?.agencyClientId ?? null,
      startup_workspace_id: startupContext?.startupWorkspaceId ?? null,
      run_source: runSource,
      requested_model_policy: scanModelPolicy.requestedModelPolicy,
      effective_model: scanModelPolicy.effectiveModel,
    })
    .select('id')
    .single();

  if (error || !row?.id) {
    return Response.json(
      { error: { code: 'db_error', message: error?.message ?? 'insert failed' } },
      { status: 500 }
    );
  }

  structuredLog(
    'scan_completed_persisted',
    {
      scanId: row.id,
      userId: agencyContext || startupContext ? sessionUserId : null,
      agencyAccountId: agencyContext?.agencyAccountId ?? null,
      agencyClientId: agencyContext?.agencyClientId ?? null,
      startupWorkspaceId: startupContext?.startupWorkspaceId ?? null,
      runSource,
      effectiveModel: scanModelPolicy.effectiveModel,
    },
    'info'
  );

  await emitMarketingEvent(supabaseForAttr, 'scan_completed', {
    ...attrCtx,
    scan_id: row.id,
    metadata: { url: scan.finalUrl, domain: scan.domain, score: scan.output.score },
  });

  return Response.json({
    scanId: row.id,
    score: scan.output.score,
    letterGrade: scan.output.letterGrade,
    topIssues: scan.output.topIssues,
    categoryScores: scan.output.categoryScores,
    finalUrl: scan.finalUrl,
    domain: scan.domain,
  });
}
