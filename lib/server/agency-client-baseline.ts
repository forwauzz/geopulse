import type { SupabaseClient } from '@supabase/supabase-js';
import { runFreeScan } from '../../workers/scan-engine/run-scan';
import { buildAuditLlm } from './fix-agent-run';
import { discoverCompetitorsLive } from './competitor-discovery-gemini';
import { resolveDiscoveryMode, type BusinessProfile } from './competitor-discovery';
import { provisionCustomerVisibilityBaseline } from './customer-visibility-baseline';
import { buildGpmEntitlementsMap } from './geo-performance-entitlements';
import {
  buildActivationRunVersion,
  executeGpmClientRun,
  resolveGpmPlatformModelMap,
  type GpmPlatform,
} from './geo-performance-schedule';
import { createBenchmarkExecutionAdapter } from './benchmark-execution';
import {
  estimateGpmActivationCostUsd,
  isGpmSpendAllowed,
  loadGpmMonthSpendUsd,
  resolveGpmSpendPolicy,
} from './gpm-spend-guard';
import { structuredError, structuredLog } from './structured-log';

type BaselineEnv = {
  readonly GEMINI_API_KEY?: string;
  readonly GEMINI_MODEL?: string;
  readonly GEMINI_ENDPOINT?: string;
  readonly OPENAI_API_KEY?: string;
  readonly PERPLEXITY_API_KEY?: string;
  readonly BENCHMARK_EXECUTION_PROVIDER?: string;
  readonly BENCHMARK_EXECUTION_API_KEY?: string;
  readonly BENCHMARK_EXECUTION_MODEL?: string;
  readonly BENCHMARK_EXECUTION_ENABLED_MODELS?: string;
  readonly BENCHMARK_EXECUTION_ENDPOINT?: string;
  readonly GPM_CHATGPT_MODEL_ID?: string;
  readonly GPM_GEMINI_MODEL_ID?: string;
  readonly GPM_PERPLEXITY_MODEL_ID?: string;
  readonly GPM_MONTHLY_SPEND_CAP_USD?: string;
  readonly GPM_CLIENT_ACTIVATION_CAP_USD?: string;
  readonly COMPETITOR_DISCOVERY_MODE?: string;
  readonly ANTHROPIC_API_KEY?: string;
  readonly GPM_NARRATIVE_MODEL?: string;
  readonly GPM_REPORT_R2_PUBLIC_BASE?: string;
  readonly RESEND_API_KEY?: string;
  readonly RESEND_FROM_EMAIL?: string;
};

type ReportBucket = {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
};

export type AgencyClientBaselineResult = {
  readonly ok: boolean;
  readonly configId: string | null;
  readonly scanId: string | null;
  readonly score: number | null;
  readonly competitorCount: number;
  readonly promptCount: number;
  readonly launchedPlatforms: readonly string[];
  readonly failedPlatforms: readonly string[];
  readonly estimatedSpendUsd: number;
  readonly monthSpendBeforeUsd: number;
  readonly monthlyCapUsd: number;
  readonly shareToken: string | null;
  readonly reason: string | null;
};

export type AgencyBaselineSweepResult = {
  readonly eligible: number;
  readonly attempted: number;
  readonly completed: number;
  readonly failed: number;
};

function canonicalDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]!;
}

function splitLocation(location: string | null | undefined): { city: string | null; region: string | null } {
  const [city, region] = (location ?? '').split(',').map((part) => part.trim());
  return { city: city || null, region: region || null };
}

function clientProfile(input: {
  vertical?: string | null;
  subvertical?: string | null;
  location?: string | null;
}): BusinessProfile {
  const { city, region } = splitLocation(input.location);
  return {
    businessType: input.subvertical?.trim() || input.vertical?.trim() || 'business services',
    city,
    region,
    confidence: input.vertical || input.subvertical ? 'medium' : 'low',
    source: input.vertical || input.subvertical ? 'heuristic' : 'unknown',
  };
}

async function recentClientScan(
  supabase: SupabaseClient<any, 'public', any>,
  clientId: string,
  domain: string,
  now: Date,
): Promise<{ id: string; score: number | null } | null> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('scans')
    .select('id,score,created_at')
    .or(`agency_client_id.eq.${clientId},domain.eq.${domain}`)
    .eq('status', 'complete')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: String(data.id), score: data.score === null ? null : Number(data.score) } : null;
}

async function runAndPersistReadinessScan(args: {
  supabase: SupabaseClient<any, 'public', any>;
  env: BaselineEnv;
  clientId: string;
  agencyAccountId: string;
  userId: string;
  domain: string;
}): Promise<{ id: string; score: number | null } | null> {
  const scan = await runFreeScan(`https://${args.domain}`, buildAuditLlm(args.env));
  const insert = scan.ok
    ? {
        url: scan.finalUrl,
        domain: scan.domain,
        status: 'complete',
        score: scan.output.score,
        letter_grade: scan.output.letterGrade,
        issues_json: scan.output.issues,
        full_results_json: {
          issues: scan.output.issues,
          categoryScores: scan.output.categoryScores,
          bucketScores: scan.output.bucketScores,
          checkCatalogVersion: scan.output.checkCatalogVersion,
          eligibility: scan.output.eligibility,
          accessMatrix: scan.output.accessMatrix,
          scoreState: 'measured',
          pageSample: scan.textSample.slice(0, 6000),
        },
        user_id: args.userId,
        agency_account_id: args.agencyAccountId,
        agency_client_id: args.clientId,
        run_source: 'agency_dashboard',
      }
    : scan.blocked
      ? {
          url: scan.blocked.requestedUrl,
          domain: scan.blocked.domain,
          status: 'complete',
          score: null,
          letter_grade: null,
          issues_json: scan.blocked.issues,
          full_results_json: {
            issues: scan.blocked.issues,
            categoryScores: [],
            accessMatrix: scan.blocked.accessMatrix,
            scoreState: 'not_tested',
          },
          user_id: args.userId,
          agency_account_id: args.agencyAccountId,
          agency_client_id: args.clientId,
          run_source: 'agency_dashboard',
        }
      : null;
  if (!insert) return null;
  const { data, error } = await args.supabase.from('scans').insert(insert).select('id,score').single();
  if (error || !data?.id) return null;
  return { id: String(data.id), score: data.score === null ? null : Number(data.score) };
}

/**
 * The single, idempotent revenue loop for an agency client. It deliberately coordinates existing
 * engines instead of introducing another queue or service.
 */
export async function completeAgencyClientBaseline(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly env: BaselineEnv;
  readonly agencyAccountId: string;
  readonly clientId: string;
  readonly userId: string;
  readonly reportEmail?: string | null;
  readonly reportBucket?: ReportBucket;
  readonly now?: Date;
}): Promise<AgencyClientBaselineResult> {
  const now = args.now ?? new Date();
  const { data: client } = await args.supabase
    .from('agency_clients')
    .select('id,name,display_name,canonical_domain,website_domain,vertical,subvertical,metadata')
    .eq('id', args.clientId)
    .eq('agency_account_id', args.agencyAccountId)
    .eq('status', 'active')
    .maybeSingle();
  const domain = canonicalDomain(client?.canonical_domain || client?.website_domain || '');
  if (!client || !domain) {
    return {
      ok: false, configId: null, scanId: null, score: null, competitorCount: 0,
      promptCount: 0, launchedPlatforms: [], failedPlatforms: [], estimatedSpendUsd: 0,
      monthSpendBeforeUsd: 0, monthlyCapUsd: resolveGpmSpendPolicy(args.env).monthlyCapUsd,
      shareToken: null, reason: 'client_or_domain_missing',
    };
  }

  const platforms: GpmPlatform[] = ['chatgpt', 'gemini', 'perplexity'];
  const promptCount = 10;
  const estimatedSpendUsd = estimateGpmActivationCostUsd(platforms, promptCount);
  const policy = resolveGpmSpendPolicy(args.env);
  const monthSpendBeforeUsd = await loadGpmMonthSpendUsd(args.supabase, now).catch(() => 0);
  const allowed = isGpmSpendAllowed({
    estimatedUsd: estimatedSpendUsd,
    monthSpendUsd: monthSpendBeforeUsd,
    policy,
  });
  if (!allowed.allowed) {
    return {
      ok: false, configId: null, scanId: null, score: null, competitorCount: 0,
      promptCount, launchedPlatforms: [], failedPlatforms: [], estimatedSpendUsd,
      monthSpendBeforeUsd, monthlyCapUsd: policy.monthlyCapUsd, shareToken: null,
      reason: allowed.reason,
    };
  }

  const profile = clientProfile({
    vertical: client.vertical,
    subvertical: client.subvertical,
    location: typeof client.metadata?.['location'] === 'string'
      ? String(client.metadata['location'])
      : null,
  });
  const discovery = resolveDiscoveryMode(args.env) === 'gemini'
    ? await discoverCompetitorsLive(args.env, profile, domain)
    : { ok: false as const, reason: 'live_discovery_disabled' };
  const discoveredDomains = discovery.ok ? discovery.competitors.map((item) => item.domain) : [];
  const baseline = await provisionCustomerVisibilityBaseline(args.supabase, {
    agencyAccountId: args.agencyAccountId,
    domain,
    companyName: client.display_name || client.name,
    vertical: client.vertical,
    subvertical: client.subvertical,
    location: [profile.city, profile.region].filter(Boolean).join(', ') || null,
    explicitCompetitors: discoveredDomains,
    reportEmail: args.reportEmail ?? null,
    source: 'agency_client_creation',
  });
  if (!baseline.ok) {
    return {
      ok: false, configId: null, scanId: null, score: null,
      competitorCount: discoveredDomains.length, promptCount, launchedPlatforms: [],
      failedPlatforms: [], estimatedSpendUsd, monthSpendBeforeUsd,
      monthlyCapUsd: policy.monthlyCapUsd, shareToken: null, reason: baseline.reason,
    };
  }

  const recent = await recentClientScan(args.supabase, args.clientId, domain, now);
  const scan = recent ?? await runAndPersistReadinessScan({
    supabase: args.supabase,
    env: args.env,
    clientId: args.clientId,
    agencyAccountId: args.agencyAccountId,
    userId: args.userId,
    domain,
  });

  const { data: config } = await args.supabase
    .from('client_benchmark_configs')
    .select('id,startup_workspace_id,agency_account_id,benchmark_domain_id,topic,location,query_set_id,competitor_list,cadence,platforms_enabled,report_email,metadata,created_at,updated_at')
    .eq('id', baseline.configId)
    .single();
  if (!config) throw new Error('baseline_config_missing');

  const metadata = {
    ...(config.metadata ?? {}),
    client_context: {
      company: client.display_name || client.name,
      category: profile.businessType,
      city: profile.city,
      region: profile.region,
    },
    competitor_research_status: discovery.ok ? 'grounded' : 'fallback',
    competitor_research_reason: discovery.ok ? null : discovery.reason,
    competitor_research: discovery.ok
      ? discovery.competitors.map((item) => ({
          name: item.name,
          domain: item.domain,
          url: item.url,
          reason: item.reason ?? null,
        }))
      : [],
    competitor_researched_at: now.toISOString(),
    prompt_count: promptCount,
    spend_guard_status: 'allowed',
    spend_estimated_usd: estimatedSpendUsd,
    spend_month_to_date_usd: monthSpendBeforeUsd,
    spend_monthly_cap_usd: policy.monthlyCapUsd,
    readiness_scan_id: scan?.id ?? null,
    onboarding_loop_version: 'jack-ready-v1',
  };
  await args.supabase
    .from('client_benchmark_configs')
    .update({ metadata, platforms_enabled: platforms, updated_at: now.toISOString() })
    .eq('id', config.id);
  const measuredConfig = { ...config, metadata, platforms_enabled: platforms };

  const entitlementMap = await buildGpmEntitlementsMap(args.supabase, [measuredConfig]);
  const entitlement = entitlementMap.get(config.id);
  if (!entitlement?.enabled) {
    return {
      ok: false, configId: config.id, scanId: scan?.id ?? null, score: scan?.score ?? null,
      competitorCount: baseline.competitors.length, promptCount, launchedPlatforms: [],
      failedPlatforms: [], estimatedSpendUsd, monthSpendBeforeUsd,
      monthlyCapUsd: policy.monthlyCapUsd, shareToken: null, reason: 'agency_entitlement_missing',
    };
  }

  const summary = await executeGpmClientRun({
    supabase: args.supabase,
    config: measuredConfig,
    entitlement,
    platformModelMap: resolveGpmPlatformModelMap(args.env),
    adapter: createBenchmarkExecutionAdapter(args.env),
    now,
    triggerSource: 'agency_activation',
    runVersion: buildActivationRunVersion(metadata, config.id),
    reportEnv: args.env,
    reportBucket: args.reportBucket
      ? {
          put: (key, value, options) => args.reportBucket!.put(key, value, options),
        }
      : undefined,
  });
  const launchedPlatforms = summary.platformResults
    .filter((item) => item.status === 'launched' || item.status === 'skipped_existing')
    .map((item) => item.platform);
  const failedPlatforms = summary.platformResults
    .filter((item) => item.status === 'failed')
    .map((item) => item.platform);
  const shareToken = typeof client.metadata?.['client_summary_share_token'] === 'string'
    ? String(client.metadata['client_summary_share_token'])
    : crypto.randomUUID().replaceAll('-', '');
  await Promise.all([
    args.supabase.from('agency_clients').update({
      metadata: {
        ...(client.metadata ?? {}),
        client_summary_share_token: shareToken,
        client_summary_shared_at: now.toISOString(),
        client_summary_shared_by_user_id: args.userId,
      },
      updated_at: now.toISOString(),
    }).eq('id', args.clientId).eq('agency_account_id', args.agencyAccountId),
    args.supabase.from('client_benchmark_configs').update({
      metadata: {
        ...metadata,
        baseline_status: launchedPlatforms.length > 0 ? 'measured' : 'failed',
        baseline_completed_at: launchedPlatforms.length > 0 ? now.toISOString() : null,
        baseline_run_group_ids: summary.platformResults.map((item) => item.runGroupId).filter(Boolean),
        baseline_error: failedPlatforms.length === platforms.length ? 'all_platforms_failed' : null,
        onboarding_loop_status: launchedPlatforms.length > 0 ? 'closed' : 'needs_retry',
        next_scheduled_at: new Date(
          now.getTime() +
          (config.cadence === 'weekly' ? 7 : config.cadence === 'biweekly' ? 14 : 30) *
          24 * 60 * 60 * 1000,
        ).toISOString(),
      },
      updated_at: now.toISOString(),
    }).eq('id', config.id),
  ]);

  structuredLog('agency_client_baseline_completed', {
    agency_account_id: args.agencyAccountId,
    client_id: args.clientId,
    config_id: config.id,
    scan_id: scan?.id ?? null,
    competitor_count: baseline.competitors.length,
    launched_platforms: launchedPlatforms.join(','),
    failed_platforms: failedPlatforms.join(','),
    estimated_spend_usd: estimatedSpendUsd,
  }, 'info');

  return {
    ok: launchedPlatforms.length > 0,
    configId: config.id,
    scanId: scan?.id ?? null,
    score: scan?.score ?? null,
    competitorCount: baseline.competitors.length,
    promptCount,
    launchedPlatforms,
    failedPlatforms,
    estimatedSpendUsd,
    monthSpendBeforeUsd,
    monthlyCapUsd: policy.monthlyCapUsd,
    shareToken,
    reason: launchedPlatforms.length > 0 ? null : 'no_provider_completed',
  };
}

/** Close queued agency onboarding loops without requiring the founder or agency owner to log in. */
export async function runAgencyBaselineCompletionSweep(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly env: BaselineEnv;
  readonly reportBucket?: ReportBucket;
  readonly limit?: number;
  readonly now?: Date;
}): Promise<AgencyBaselineSweepResult> {
  const limit = Math.max(1, Math.min(args.limit ?? 1, 3));
  const { data: configs } = await args.supabase
    .from('client_benchmark_configs')
    .select('id,agency_account_id,benchmark_domain_id,report_email,metadata,created_at')
    .not('agency_account_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(50);
  const eligibleConfigs = ((configs ?? []) as Array<{
    id: string;
    agency_account_id: string;
    benchmark_domain_id: string;
    report_email: string | null;
    metadata: Record<string, unknown> | null;
  }>).filter((config) => {
    const metadata = config.metadata ?? {};
    return metadata['onboarding_loop_status'] !== 'closed'
      && metadata['baseline_status'] !== 'measured'
      && metadata['spend_guard_status'] !== 'blocked';
  });

  let attempted = 0;
  let completed = 0;
  let failed = 0;
  for (const config of eligibleConfigs.slice(0, limit)) {
    const [{ data: domain }, { data: members }] = await Promise.all([
      args.supabase
        .from('benchmark_domains')
        .select('canonical_domain')
        .eq('id', config.benchmark_domain_id)
        .maybeSingle(),
      args.supabase
        .from('agency_users')
        .select('user_id,role')
        .eq('agency_account_id', config.agency_account_id)
        .eq('status', 'active')
        .in('role', ['owner', 'admin'])
        .limit(1),
    ]);
    if (!domain?.canonical_domain || !members?.[0]?.user_id) {
      failed += 1;
      continue;
    }
    const { data: client } = await args.supabase
      .from('agency_clients')
      .select('id')
      .eq('agency_account_id', config.agency_account_id)
      .eq('canonical_domain', domain.canonical_domain)
      .eq('status', 'active')
      .maybeSingle();
    if (!client?.id) {
      failed += 1;
      continue;
    }
    attempted += 1;
    try {
      const result = await completeAgencyClientBaseline({
        supabase: args.supabase,
        env: args.env,
        agencyAccountId: config.agency_account_id,
        clientId: client.id,
        userId: members[0].user_id,
        reportEmail: config.report_email,
        reportBucket: args.reportBucket,
        now: args.now,
      });
      if (result.ok) completed += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      structuredError('agency_client_baseline_sweep_failed', {
        config_id: config.id,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
  return { eligible: eligibleConfigs.length, attempted, completed, failed };
}
