import { z } from 'zod';
import { GeminiProvider } from '@workers/providers/gemini';
import type { LLMProvider } from '@workers/lib/interfaces/providers';
import { runFreeScan } from '@workers/scan-engine/run-scan';
import { getClientIp, getScanApiEnv } from '@/lib/server/cf-env';
import { checkScanRateLimit } from '@/lib/server/rate-limit-kv';
import { resolveAgencyFeatureEntitlements, validateAgencyContext } from '@/lib/server/agency-access';
import { resolveAgencyModelPolicy } from '@/lib/server/agency-model-policy';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyTurnstileToken } from '@/lib/server/turnstile';
import { emitMarketingEvent } from '@services/marketing-attribution/emit';
import { optionalAttributionFields } from '@services/marketing-attribution/attribution-params';

export const runtime = 'nodejs';

const bodySchema = z.object({
  url: z.string().url(),
  turnstileToken: z.string().min(1),
  agencyAccountId: z.string().uuid().nullish(),
  agencyClientId: z.string().uuid().nullish(),
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

  let agencyContext: { agencyAccountId: string | null; agencyClientId: string | null } | null = null;
  if (agencyAccountId) {
    try {
      const sessionClient = await createSupabaseServerClient();
      const {
        data: { user },
      } = await sessionClient.auth.getUser();

      if (
        user?.id &&
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
      }
    } catch {
      agencyContext = null;
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
      user_id: null,
      agency_account_id: agencyContext?.agencyAccountId ?? null,
      agency_client_id: agencyContext?.agencyClientId ?? null,
      run_source: agencyContext ? 'agency_dashboard' : 'public_self_serve',
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
