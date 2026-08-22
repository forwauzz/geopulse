import { canonicalizeDomain } from './dashboard-citation-metrics';
import { structuredError, structuredLog } from './structured-log';
import { retrieveIntelligenceEvidence } from '@/lib/intelligence/evidence-retrieval';
import {
  deriveOrganizationMeasurementBinding,
  organizationMeasurementMetadata,
} from '@/lib/intelligence/organization-measurement-context';
import type { OrganizationContext } from '@/lib/intelligence/organization-context';
import { IDENTITY_NORMALIZATION_VERSION } from '@/lib/intelligence/identity';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConfirmedOrganizationContextWrite } from './organization-context-repository';

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
  /** A previously confirmed query set may be retained only after its own provenance is verified. */
  readonly approvedQuerySetId?: string | null;
  /** Confirmed canonical context. Without it configuration may be staged, but measurement fails closed. */
  readonly organizationContext?: OrganizationContext;
  readonly source: 'startup_onboarding' | 'agency_client_creation' | 'agency_client_profile_update' | 'backfill';
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
  | {
      readonly ok: true;
      readonly workspaceId: string;
      readonly baseline: VisibilityBaselineResult;
      readonly organizationContextVersion?: string;
    }
  | { readonly ok: false; readonly reason: string };

const PROVISIONING_VERSION = 'customer-baseline-v3';
const PROMPT_TEMPLATE_VERSION = 'service-aware-v2';
const DEFAULT_VERTICAL = 'business services';
const DEFAULT_LOCATION = 'your market';

export function isApprovedCustomerQuerySet(args: {
  readonly metadata: unknown;
  readonly status: unknown;
  readonly canonicalDomain: string;
  readonly promptCount: number;
  readonly expectedContextVersion?: string;
  readonly expectedQuerySetVersion?: string;
}): boolean {
  const metadata = args.metadata && typeof args.metadata === 'object'
    ? args.metadata as Record<string, unknown>
    : {};
  const verifiedAt = typeof metadata['source_verified_at'] === 'string'
    ? metadata['source_verified_at']
    : '';
  return args.status === 'active'
    && metadata['canonical_domain'] === args.canonicalDomain
    && args.promptCount === 10
    && metadata['approved_for_measurement'] === true
    && (!args.expectedContextVersion || metadata['organization_context_version'] === args.expectedContextVersion)
    && (!args.expectedQuerySetVersion || metadata['query_set_version'] === args.expectedQuerySetVersion)
    && Boolean(verifiedAt);
}

function cleanPhrase(value: string | null | undefined, fallback: string): string {
  const cleaned = value?.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return cleaned || fallback;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function promptContextVersion(args: {
  readonly category: string | null;
  readonly location: string;
  readonly buyer?: string | null;
  readonly services?: readonly string[];
}): string {
  const value = [
    PROMPT_TEMPLATE_VERSION,
    args.category ?? DEFAULT_VERTICAL,
    args.location,
    args.buyer ?? '',
    ...(args.services ?? []),
  ].join('|').trim().toLowerCase();
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
  readonly languages?: readonly string[];
  readonly buyer?: string | null;
  readonly services?: readonly string[];
}): readonly string[] {
  const category = cleanPhrase(input.subvertical, cleanPhrase(input.vertical, DEFAULT_VERTICAL));
  const location = cleanPhrase(input.location, DEFAULT_LOCATION);
  const buyer = cleanPhrase(input.buyer, 'buyers');
  const services = unique((input.services ?? []).map((service) => cleanPhrase(service, ''))).slice(0, 2);
  const primaryService = services[0] ?? category;
  const servicePair = services.length > 1 ? `${services[0]} and ${services[1]}` : primaryService;
  const languageLabels = unique((input.languages ?? []).map((language) => {
    const code = language.toLowerCase().split('-')[0];
    if (code === 'en') return 'English';
    if (code === 'fr') return 'French';
    if (code === 'es') return 'Spanish';
    return language;
  }));
  const languageQuestion = languageLabels.length > 0
    ? `Which ${category} providers in ${location} serve customers in ${languageLabels.join(' and ')}?`
    : `Which ${category} providers in ${location} have the strongest customer reviews?`;
  return unique([
    `What are the best ${category} providers for ${buyer} in ${location}?`,
    `Which ${category} provider should ${buyer} choose in ${location}?`,
    `Compare the leading ${category} providers for ${buyer} in ${location}.`,
    `Which ${category} providers support ${primaryService} for ${buyer} in ${location}?`,
    `What should ${buyer} look for when choosing a ${category} provider in ${location}?`,
    `Which ${category} providers in ${location} have the strongest expertise, product evidence, and customer proof?`,
    `What are the best ${category} alternatives for ${buyer} in ${location}?`,
    languageQuestion,
    `How much should ${buyer} expect to pay for ${category} in ${location}?`,
    `Which ${category} provider is the best fit for ${buyer} who need ${servicePair} in ${location}?`,
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

/**
 * Which competitor cohort a baseline should store.
 *
 * Two rules, both learned from a client that measured against nobody:
 *
 * An empty cohort is not an answer. The bound cohort used to be taken with `??`,
 * which accepts `[]` as a value, so a confirmed context carrying no competitors
 * silently discarded the explicit and suggested lists too.
 *
 * A cohort already stored is never traded for an empty one. Grounded discovery can
 * be unavailable — an unbilled key, a market it cannot resolve — and that must not
 * cost the tenant competitors they already gave us.
 *
 * `suggest` stays lazy so a bound cohort still skips the query.
 */
export async function resolveCompetitorCohort(args: {
  readonly bound?: readonly string[] | null;
  readonly stored: readonly string[];
  readonly suggest: () => Promise<readonly string[]>;
}): Promise<readonly string[]> {
  const bound = args.bound ?? [];
  if (bound.length > 0) return bound;
  const suggested = await args.suggest();
  return suggested.length > 0 ? suggested : args.stored;
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
  const measurement = input.organizationContext
    ? deriveOrganizationMeasurementBinding(input.organizationContext)
    : null;
  if (measurement && !measurement.ok) {
    return { ok: false, reason: measurement.reasons.join(',') };
  }
  const binding = measurement?.ok ? measurement.binding : null;
  if (binding && binding.canonicalDomain !== canonicalDomain) {
    return { ok: false, reason: 'organization_context_domain_mismatch' };
  }
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
    const subvertical = binding?.category || input.subvertical?.trim() || existingDomain?.subvertical || null;
    const location = binding
      ? binding.locality || binding.serviceAreas[0] || binding.countryCode
      : input.location?.trim() || existingDomain?.geo_region || DEFAULT_LOCATION;
    const companyName =
      input.companyName?.trim() ||
      existingDomain?.display_name ||
      canonicalDomain.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
    let prompts = [...buildBaselineBuyerPrompts({
      vertical,
      subvertical,
      location,
      languages: binding?.languages,
      buyer: binding?.buyer,
      services: binding?.services,
    })];
    const querySetVersion = binding?.querySetVersion ?? promptContextVersion({
      category: subvertical || vertical,
      location,
      buyer: binding?.buyer,
      services: binding?.services,
    });

    let querySet: { id: string } | null = null;
    let preservedApprovedQuerySet = false;
    if (input.approvedQuerySetId) {
      const [{ data: approvedSet }, { data: approvedQueries }] = await Promise.all([
        supabase
          .from('benchmark_query_sets')
          .select('id,status,metadata')
          .eq('id', input.approvedQuerySetId)
          .maybeSingle(),
        supabase
          .from('benchmark_queries')
          .select('query_text')
          .eq('query_set_id', input.approvedQuerySetId)
          .order('query_key', { ascending: true })
          .limit(11),
      ]);
      const approvedPromptRows = (approvedQueries ?? []) as Array<{ query_text: string }>;
      if (approvedSet?.id && isApprovedCustomerQuerySet({
        metadata: approvedSet.metadata,
        status: approvedSet.status,
        canonicalDomain,
        promptCount: approvedPromptRows.length,
        expectedContextVersion: binding?.contextVersion,
        expectedQuerySetVersion: binding?.querySetVersion,
      })) {
        querySet = { id: String(approvedSet.id) };
        prompts = approvedPromptRows.map((row) => row.query_text);
        preservedApprovedQuerySet = true;
      }
    }

    if (!querySet) {
      const { data, error } = await supabase
        .from('benchmark_query_sets')
        .upsert(
          {
            name: `client-prompts-${canonicalDomain}`,
            version: querySetVersion,
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
              ...(binding ? organizationMeasurementMetadata(binding) : {}),
              updated_at: now,
            },
          },
          { onConflict: 'name,version' }
        )
        .select('id')
        .single();
      if (error || !data?.id) {
        return { ok: false, reason: error?.message ?? 'query_set_failed' };
      }
      querySet = { id: String(data.id) };
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
    if (binding) {
      const { data: existingMapping, error: mappingReadError } = await supabase
        .from('intelligence_source_identity_maps')
        .select('canonical_domain_id,mapping_status')
        .eq('source_kind', 'benchmark_domain')
        .eq('source_id', String(domainRow.id))
        .maybeSingle();
      if (mappingReadError) return { ok: false, reason: mappingReadError.message };
      if (existingMapping?.canonical_domain_id
        && String(existingMapping.canonical_domain_id) !== binding.organizationIdentityId) {
        return { ok: false, reason: 'benchmark_domain_identity_conflict' };
      }
      const { error: mappingError } = await supabase.from('intelligence_source_identity_maps').upsert({
        source_kind: 'benchmark_domain',
        source_id: String(domainRow.id),
        source_table: 'benchmark_domains',
        canonical_domain_id: binding.organizationIdentityId,
        canonical_page_id: null,
        mapping_status: 'mapped',
        unmapped_reason: null,
        observed_host: canonicalDomain,
        observed_url: `https://${canonicalDomain}`,
        normalization_version: IDENTITY_NORMALIZATION_VERSION,
        metadata: {
          source: input.source,
          organization_context_version: binding.contextVersion,
          organization_context_hash: binding.contextHash,
        },
      }, { onConflict: 'source_kind,source_id' });
      if (mappingError) return { ok: false, reason: mappingError.message };
    }

    const { error: promptError } = preservedApprovedQuerySet
      ? { error: null }
      : await supabase.from('benchmark_queries').upsert(
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

    const ownerFilter = input.startupWorkspaceId
      ? { column: 'startup_workspace_id', value: input.startupWorkspaceId }
      : { column: 'agency_account_id', value: input.agencyAccountId };
    const { data: existingConfig } = await supabase
      .from('client_benchmark_configs')
      .select('id,metadata,competitor_list,report_email,cadence,platforms_enabled')
      .eq(ownerFilter.column, ownerFilter.value)
      .eq('benchmark_domain_id', domainRow.id)
      .maybeSingle();
    const storedCompetitors = Array.isArray(existingConfig?.competitor_list)
      ? existingConfig.competitor_list.filter((entry: unknown): entry is string => typeof entry === 'string')
      : [];

    const competitors = await resolveCompetitorCohort({
      bound: binding?.trackedCompetitorDomains,
      stored: storedCompetitors,
      suggest: () => suggestCompetitors({
        supabase,
        canonicalDomain,
        vertical,
        subvertical,
        explicit: input.explicitCompetitors ?? [],
      }),
    });
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
      cadence: typeof existingConfig?.cadence === 'string' ? existingConfig.cadence : 'monthly',
      platforms_enabled: Array.isArray(existingConfig?.platforms_enabled)
        && existingConfig.platforms_enabled.length > 0
        ? existingConfig.platforms_enabled
        : ['chatgpt', 'gemini', 'perplexity'],
      report_email: input.reportEmail?.trim()
        || (typeof existingConfig?.report_email === 'string' ? existingConfig.report_email : null),
      metadata: {
        ...existingMetadata,
        setup_source: input.source,
        prompt_source: preservedApprovedQuerySet ? 'source_verified' : 'automatic_baseline',
        prompt_count: prompts.length,
        competitor_source: competitors.length > 0 ? 'intelligence_cohort' : 'awaiting_customer_input',
        intelligence_status: intelligence.status,
        intelligence_evidence_ids: intelligence.evidence.map((item) => item.evidenceId),
        intelligence_limitations: intelligence.limitations,
        baseline_status: existingMetadata['baseline_status'] === 'measured'
          && (!binding || existingMetadata['organization_context_version'] === binding.contextVersion)
          ? 'measured'
          : 'queued',
        baseline_requested_at: existingMetadata['baseline_requested_at'] ?? now,
        provisioning_version: PROVISIONING_VERSION,
        prompt_context_version: binding?.contextVersion ?? querySet.id,
        ...(binding ? organizationMeasurementMetadata(binding) : {}),
        baseline_required_reason: binding
          && existingMetadata['organization_context_version']
          && existingMetadata['organization_context_version'] !== binding.contextVersion
          ? 'organization_context_changed'
          : null,
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
  readonly confirmedOrganization?: Omit<ConfirmedOrganizationContextWrite, 'ownerType' | 'ownerId'>;
  readonly persistOrganizationContext?: (args: {
    readonly supabase: SupabaseClient<any, 'public', any>;
    readonly input: ConfirmedOrganizationContextWrite;
  }) => Promise<OrganizationContext>;
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

    const organizationContext = args.confirmedOrganization && args.persistOrganizationContext
      ? await args.persistOrganizationContext({
          supabase: args.supabase as any,
          input: {
            ...args.confirmedOrganization,
            ownerType: 'startup_workspace',
            ownerId: String(workspace.id),
          },
        })
      : undefined;
    const baseline = await provisionCustomerVisibilityBaseline(args.supabase, {
      startupWorkspaceId: workspace.id,
      domain: canonicalDomain,
      companyName: name,
      organizationContext,
      source: 'startup_onboarding',
    });
    return {
      ok: true,
      workspaceId: workspace.id,
      baseline,
      organizationContextVersion: organizationContext?.contextVersion,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown' };
  }
}
