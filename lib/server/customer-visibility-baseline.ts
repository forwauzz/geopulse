import { canonicalizeDomain } from './dashboard-citation-metrics';
import { structuredError, structuredLog } from './structured-log';
import { retrieveIntelligenceEvidence } from '@/lib/intelligence/evidence-retrieval';

type SupabaseLike = { from(table: string): any };

export type VisibilityBaselineOwner =
  | { readonly startupWorkspaceId: string; readonly agencyAccountId?: never }
  | { readonly agencyAccountId: string; readonly startupWorkspaceId?: never };

export type VisibilityBaselineInput = VisibilityBaselineOwner & {
  readonly domain: string;
  readonly companyName?: string | null;
  readonly vertical?: string | null;
  readonly subvertical?: string | null;
  readonly location?: string | null;
  readonly explicitCompetitors?: readonly string[];
  readonly reportEmail?: string | null;
  readonly source: 'startup_onboarding' | 'agency_client_creation' | 'backfill';
};

export type VisibilityBaselineResult =
  | {
      readonly ok: true;
      readonly configId: string;
      readonly benchmarkDomainId: string;
      readonly querySetId: string;
      readonly promptCount: number;
      readonly competitors: readonly string[];
    }
  | { readonly ok: false; readonly reason: string };

export type FreeVisibilityWorkspaceResult =
  | { readonly ok: true; readonly workspaceId: string; readonly baseline: VisibilityBaselineResult }
  | { readonly ok: false; readonly reason: string };

const PROVISIONING_VERSION = 'customer-baseline-v3';
const PROMPT_TEMPLATE_VERSION = 'local-market-v1';
const DEFAULT_VERTICAL = 'business services';
const DEFAULT_LOCATION = 'your market';

function cleanPhrase(value: string | null | undefined, fallback: string): string {
  const cleaned = value?.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return cleaned || fallback;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function promptContextVersion(category: string | null, location: string): string {
  const value = `${PROMPT_TEMPLATE_VERSION}|${category ?? DEFAULT_VERTICAL}|${location}`.trim().toLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v4-${(hash >>> 0).toString(36)}`;
}

export function buildBaselineBuyerPrompts(input: {
  readonly vertical?: string | null;
  readonly subvertical?: string | null;
  readonly location?: string | null;
}): readonly string[] {
  const category = cleanPhrase(input.subvertical, cleanPhrase(input.vertical, DEFAULT_VERTICAL));
  const location = cleanPhrase(input.location, DEFAULT_LOCATION);
  return unique([
    `What are the best ${category} providers in ${location}?`,
    `Which ${category} provider should I choose in ${location}?`,
    `Compare the leading ${category} providers in ${location}.`,
    `Who is known for trustworthy ${category} services in ${location}?`,
    `What should I look for when choosing a ${category} provider in ${location}?`,
    `Which ${category} providers in ${location} have the strongest expertise and proof?`,
    `What are the best ${category} alternatives in ${location}?`,
    `Which ${category} providers in ${location} have the strongest customer reviews?`,
    `How much should I expect to pay for ${category} in ${location}?`,
    `Which ${category} provider is best for my specific needs in ${location}?`,
  ]);
}

function promptKey(index: number, text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54);
  return `baseline-${String(index + 1).padStart(2, '0')}-${slug}`;
}

async function suggestCompetitors(args: {
  readonly supabase: SupabaseLike;
  readonly canonicalDomain: string;
  readonly vertical: string | null;
  readonly subvertical: string | null;
  readonly explicit: readonly string[];
}): Promise<string[]> {
  const explicit = unique(
    args.explicit
      .map((value) => canonicalizeDomain(value))
      .filter((value): value is string => Boolean(value) && value !== args.canonicalDomain)
  );
  if (explicit.length >= 3) return explicit.slice(0, 5);
  if (!args.vertical && !args.subvertical) return explicit;

  const { data } = await args.supabase
    .from('benchmark_domains')
    .select('canonical_domain,vertical,subvertical,is_customer,is_competitor')
    .neq('canonical_domain', args.canonicalDomain)
    .limit(100);

  const vertical = cleanPhrase(args.vertical, '').toLowerCase();
  const subvertical = cleanPhrase(args.subvertical, '').toLowerCase();
  const candidates = ((data ?? []) as Array<{
    canonical_domain: string;
    vertical: string | null;
    subvertical: string | null;
    is_customer: boolean;
    is_competitor: boolean;
  }>)
    .filter((row) => {
      const rowVertical = cleanPhrase(row.vertical, '').toLowerCase();
      const rowSubvertical = cleanPhrase(row.subvertical, '').toLowerCase();
      return (subvertical && rowSubvertical === subvertical) || (vertical && rowVertical === vertical);
    })
    .sort((a, b) => Number(b.is_competitor) - Number(a.is_competitor) || Number(a.is_customer) - Number(b.is_customer))
    .map((row) => canonicalizeDomain(row.canonical_domain))
    .filter((value): value is string => Boolean(value));

  return unique([...explicit, ...candidates]).slice(0, 5);
}

export async function provisionCustomerVisibilityBaseline(
  supabase: SupabaseLike,
  input: VisibilityBaselineInput
): Promise<VisibilityBaselineResult> {
  const canonicalDomain = canonicalizeDomain(input.domain);
  if (!canonicalDomain) return { ok: false, reason: 'invalid_domain' };
  const now = new Date().toISOString();

  try {
    const intelligence = await retrieveIntelligenceEvidence(supabase, input.startupWorkspaceId
      ? {
          tenantType: 'startup_workspace',
          tenantId: input.startupWorkspaceId,
          domainHost: canonicalDomain,
          limit: 20,
        }
      : {
          tenantType: 'agency_account',
          tenantId: input.agencyAccountId!,
          domainHost: canonicalDomain,
          limit: 20,
        }).catch(() => ({
          status: 'insufficient_evidence' as const,
          evidence: [] as const,
          limitations: ['The intelligence index is not available yet.'],
        }));
    const { data: existingDomain } = await supabase
      .from('benchmark_domains')
      .select('id,display_name,vertical,subvertical,geo_region,metadata')
      .eq('canonical_domain', canonicalDomain)
      .maybeSingle();

    const vertical = input.vertical?.trim() || existingDomain?.vertical || null;
    const subvertical = input.subvertical?.trim() || existingDomain?.subvertical || null;
    const location = input.location?.trim() || existingDomain?.geo_region || DEFAULT_LOCATION;
    const companyName =
      input.companyName?.trim() ||
      existingDomain?.display_name ||
      canonicalDomain.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
    const prompts = buildBaselineBuyerPrompts({ vertical, subvertical, location });
    const contextVersion = promptContextVersion(subvertical || vertical, location);

    const { data: querySet, error: querySetError } = await supabase
      .from('benchmark_query_sets')
      .upsert(
        {
          name: `client-prompts-${canonicalDomain}`,
          version: contextVersion,
          vertical,
          description: `Automatically provisioned buyer questions for ${canonicalDomain}.`,
          status: 'active',
          metadata: {
            source: input.source,
            canonical_domain: canonicalDomain,
            provisioning_version: PROVISIONING_VERSION,
            prompt_source: intelligence.status === 'ready'
              ? 'deterministic_company_context_plus_intelligence'
              : 'deterministic_company_context',
            intelligence_evidence_ids: intelligence.evidence.map((item) => item.evidenceId),
            updated_at: now,
          },
        },
        { onConflict: 'name,version' }
      )
      .select('id')
      .single();
    if (querySetError || !querySet?.id) {
      return { ok: false, reason: querySetError?.message ?? 'query_set_failed' };
    }

    const domainMetadata = {
      ...((existingDomain?.metadata && typeof existingDomain.metadata === 'object')
        ? existingDomain.metadata
        : {}),
      source: input.source,
      schedule_enabled: true,
      schedule_query_set_id: querySet.id,
      provisioning_version: PROVISIONING_VERSION,
      updated_at: now,
    };
    const { data: domainRow, error: domainError } = await supabase
      .from('benchmark_domains')
      .upsert(
        {
          domain: canonicalDomain,
          canonical_domain: canonicalDomain,
          site_url: `https://${canonicalDomain}`,
          display_name: companyName,
          vertical,
          subvertical,
          geo_region: location === DEFAULT_LOCATION ? null : location,
          is_customer: true,
          metadata: domainMetadata,
        },
        { onConflict: 'canonical_domain' }
      )
      .select('id')
      .single();
    if (domainError || !domainRow?.id) {
      return { ok: false, reason: domainError?.message ?? 'domain_failed' };
    }

    const { error: promptError } = await supabase.from('benchmark_queries').upsert(
      prompts.map((queryText, index) => ({
        query_set_id: querySet.id,
        query_key: promptKey(index, queryText),
        query_text: queryText,
        intent_type: index === 2 || index === 6 ? 'comparative' : 'discovery',
        topic: cleanPhrase(subvertical, cleanPhrase(vertical, DEFAULT_VERTICAL)),
        weight: 1,
        metadata: {
          source: input.source,
          generated: true,
          provisioning_version: PROVISIONING_VERSION,
          generated_at: now,
        },
      })),
      { onConflict: 'query_set_id,query_key' }
    );
    if (promptError) return { ok: false, reason: promptError.message };

    const competitors = await suggestCompetitors({
      supabase,
      canonicalDomain,
      vertical,
      subvertical,
      explicit: input.explicitCompetitors ?? [],
    });

    const ownerFilter = input.startupWorkspaceId
      ? { column: 'startup_workspace_id', value: input.startupWorkspaceId }
      : { column: 'agency_account_id', value: input.agencyAccountId };
    const { data: existingConfig } = await supabase
      .from('client_benchmark_configs')
      .select('id,metadata')
      .eq(ownerFilter.column, ownerFilter.value)
      .eq('benchmark_domain_id', domainRow.id)
      .maybeSingle();
    const existingMetadata =
      existingConfig?.metadata && typeof existingConfig.metadata === 'object'
        ? existingConfig.metadata
        : {};
    const payload = {
      startup_workspace_id: input.startupWorkspaceId ?? null,
      agency_account_id: input.agencyAccountId ?? null,
      benchmark_domain_id: domainRow.id,
      topic: cleanPhrase(subvertical, cleanPhrase(vertical, DEFAULT_VERTICAL)),
      location,
      query_set_id: querySet.id,
      competitor_list: competitors,
      cadence: 'monthly',
      platforms_enabled: ['chatgpt', 'gemini', 'perplexity'],
      report_email: input.reportEmail?.trim() || null,
      metadata: {
        ...existingMetadata,
        setup_source: input.source,
        prompt_source: 'automatic_baseline',
        prompt_count: prompts.length,
        competitor_source: competitors.length > 0 ? 'intelligence_cohort' : 'awaiting_customer_input',
        intelligence_status: intelligence.status,
        intelligence_evidence_ids: intelligence.evidence.map((item) => item.evidenceId),
        intelligence_limitations: intelligence.limitations,
        baseline_status: existingMetadata['baseline_status'] === 'measured' ? 'measured' : 'queued',
        baseline_requested_at: existingMetadata['baseline_requested_at'] ?? now,
        provisioning_version: PROVISIONING_VERSION,
        prompt_context_version: querySet.id,
        updated_at: now,
      },
      updated_at: now,
    };

    let configId = existingConfig?.id as string | undefined;
    if (configId) {
      const { error } = await supabase.from('client_benchmark_configs').update(payload).eq('id', configId);
      if (error) return { ok: false, reason: error.message };
    } else {
      const { data: created, error } = await supabase
        .from('client_benchmark_configs')
        .insert(payload)
        .select('id')
        .single();
      if (error || !created?.id) return { ok: false, reason: error?.message ?? 'config_failed' };
      configId = created.id;
    }

    structuredLog('customer_visibility_baseline_provisioned', {
      config_id: configId,
      domain: canonicalDomain,
      source: input.source,
      prompt_count: prompts.length,
      competitor_count: competitors.length,
    }, 'info');

    return {
      ok: true,
      configId: configId!,
      benchmarkDomainId: domainRow.id,
      querySetId: querySet.id,
      promptCount: prompts.length,
      competitors,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    structuredError('customer_visibility_baseline_provision_failed', {
      domain: canonicalDomain,
      source: input.source,
      reason,
    });
    return { ok: false, reason };
  }
}

export async function ensureFreeVisibilityWorkspace(args: {
  readonly supabase: SupabaseLike;
  readonly userId: string;
  readonly userEmail?: string | null;
  readonly domain: string;
  readonly companyName?: string | null;
}): Promise<FreeVisibilityWorkspaceResult> {
  const canonicalDomain = canonicalizeDomain(args.domain);
  if (!canonicalDomain) return { ok: false, reason: 'invalid_domain' };
  const workspaceKey = `onboarding-${args.userId.toLowerCase().replace(/[^a-z0-9-]/g, '')}`.slice(0, 63);
  const name =
    args.companyName?.trim() ||
    canonicalDomain.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');

  try {
    const { data: workspace, error } = await args.supabase
      .from('startup_workspaces')
      .upsert(
        {
          workspace_key: workspaceKey,
          name,
          primary_domain: canonicalDomain,
          canonical_domain: canonicalDomain,
          status: 'active',
          billing_mode: 'free',
          metadata: {
            source: 'customer_visibility_onboarding',
            website_url: `https://${canonicalDomain}`,
          },
        },
        { onConflict: 'workspace_key' }
      )
      .select('id')
      .single();
    if (error || !workspace?.id) return { ok: false, reason: error?.message ?? 'workspace_failed' };

    const { error: memberError } = await args.supabase.from('startup_workspace_users').upsert(
      {
        startup_workspace_id: workspace.id,
        user_id: args.userId,
        role: 'founder',
        status: 'active',
        metadata: { source: 'customer_visibility_onboarding' },
      },
      { onConflict: 'startup_workspace_id,user_id' }
    );
    if (memberError) return { ok: false, reason: memberError.message };

    const { error: domainError } = await args.supabase.from('startup_workspace_domains').upsert(
      {
        startup_workspace_id: workspace.id,
        domain: canonicalDomain,
        canonical_domain: canonicalDomain,
        site_url: `https://${canonicalDomain}`,
        is_primary: true,
        metadata: { source: 'customer_visibility_onboarding' },
      },
      { onConflict: 'startup_workspace_id,canonical_domain' }
    );
    if (domainError) return { ok: false, reason: domainError.message };

    const baseline = await provisionCustomerVisibilityBaseline(args.supabase, {
      startupWorkspaceId: workspace.id,
      domain: canonicalDomain,
      companyName: name,
      source: 'startup_onboarding',
    });
    return { ok: true, workspaceId: workspace.id, baseline };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown' };
  }
}
