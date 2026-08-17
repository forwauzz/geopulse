import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { buildClinicConsultingChallengerPreview } from '../lib/server/clinic-consulting-challenger';
import { seedBenchmarkDomainCohort } from '../lib/server/benchmark-domain-cohort-seed';
import { seedBenchmarkQuerySet } from '../lib/server/benchmark-query-set-seed';
import { persistConfirmedOrganizationContext } from '../lib/server/organization-context-repository';
import {
  deriveOrganizationMeasurementBinding,
  organizationMeasurementMetadata,
} from '../lib/intelligence/organization-measurement-context';
import { createServiceRoleClient } from '../lib/supabase/service-role';

const TARGET_DOMAIN = 'techehealthservices.com';

function parseArgs(argv: string[]) {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) flags.add(token.slice(2));
    else {
      values.set(token.slice(2), next);
      index += 1;
    }
  }
  return {
    apply: flags.has('apply'),
    confirmingUserId: values.get('confirming-user-id') ?? null,
    queryFixture: values.get('query-fixture')
      ?? 'eval/fixtures/benchmark-clinic-consulting-quebec-v1-query-set.json',
    cohortFixture: values.get('cohort-fixture')
      ?? 'eval/fixtures/benchmark-clinic-consulting-quebec-v1-domains.json',
  };
}

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const preview = buildClinicConsultingChallengerPreview(
    loadJson(args.queryFixture),
    loadJson(args.cohortFixture),
  );
  const competitors = preview.cohort.domains
    .filter((domain) => domain.metadata.comparison_role !== 'target_subject')
    .map((domain) => domain.domain);

  console.log(JSON.stringify({
    mode: args.apply ? 'apply' : 'dry_run',
    issue: 500,
    exactTargets: {
      querySetName: preview.querySet.name,
      benchmarkDomain: TARGET_DOMAIN,
      cohortDomains: preview.cohort.domains.map((domain) => domain.domain),
      configLookup: `benchmark_domain:${TARGET_DOMAIN}`,
      workspaceCanonicalRepair: `${TARGET_DOMAIN} only`,
    },
    plannedMutations: [
      'persist one founder-confirmed startup-workspace organization context',
      'upsert one versioned 20-question bilingual query set',
      'upsert ten source-linked benchmark domains while preserving metadata history',
      'bind the existing Teché benchmark domain and config to the new query set',
      'normalize only the existing Teché workspace canonical-domain fields',
    ],
    preview: preview.summary,
  }, null, 2));
  if (!args.apply) return;

  const confirmingUserId = z.string().uuid().parse(args.confirmingUserId);
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('production_supabase_env_missing');
  const supabase = createServiceRoleClient(url, key);

  const { data: currentDomain, error: currentDomainError } = await supabase
    .from('benchmark_domains')
    .select('id,metadata')
    .eq('canonical_domain', TARGET_DOMAIN)
    .single();
  if (currentDomainError || !currentDomain) throw currentDomainError ?? new Error('teche_domain_missing');

  const { data: configs, error: configError } = await supabase
    .from('client_benchmark_configs')
    .select('id,startup_workspace_id,metadata')
    .eq('benchmark_domain_id', currentDomain.id);
  if (configError) throw configError;
  if (configs?.length !== 1 || !configs[0]?.startup_workspace_id) {
    throw new Error(`expected_one_teche_startup_config_found_${configs?.length ?? 0}`);
  }
  const config = configs[0];
  const { data: membership, error: membershipError } = await supabase
    .from('startup_workspace_users')
    .select('user_id,role,status')
    .eq('startup_workspace_id', config.startup_workspace_id)
    .eq('user_id', confirmingUserId)
    .eq('status', 'active')
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership || !['founder', 'admin'].includes(membership.role)) {
    throw new Error('confirming_user_is_not_an_active_teche_founder');
  }

  const context = await persistConfirmedOrganizationContext({
    supabase,
    input: {
      ownerType: 'startup_workspace',
      ownerId: config.startup_workspace_id,
      actorId: confirmingUserId,
      canonicalDomain: TARGET_DOMAIN,
      displayName: 'Teché Consulting',
      category: 'Clinical operations and practical AI consulting for private clinics',
      services: [
        'clinical operations assessment',
        'clinic workflow improvement',
        'EMR optimization and implementation',
        'practical AI tool selection and implementation',
        'bilingual clinic team training',
      ],
      buyer: 'Owners and operational leaders of private clinics in Quebec',
      marketScope: 'regional',
      countryCode: 'CA',
      subdivisionCode: 'CA-QC',
      locality: 'Montreal',
      serviceAreas: ['Montreal', 'Quebec'],
      languages: ['en-CA', 'fr-CA'],
      timezone: 'America/Toronto',
      approvedCompetitorDomains: competitors,
      source: 'issue_500_founder_confirmation',
    },
  });
  const bindingResult = deriveOrganizationMeasurementBinding(context);
  if (!bindingResult.ok) throw new Error(`organization_binding_failed:${bindingResult.reasons.join(',')}`);
  const measurementMetadata = organizationMeasurementMetadata(bindingResult.binding);

  const queryResult = await seedBenchmarkQuerySet(supabase, {
    ...preview.querySet,
    version: bindingResult.binding.querySetVersion,
    metadata: {
      ...preview.querySet.metadata,
      ...measurementMetadata,
      methodology_version: 'clinic-consulting-quebec-v1',
      issue: 500,
    },
  });
  const cohortResult = await seedBenchmarkDomainCohort(supabase, {
    ...preview.cohort,
    domains: preview.cohort.domains.map((domain) => ({
      ...domain,
      metadata: {
        ...domain.metadata,
        issue: 500,
        public_claims_allowed: false,
        ...(domain.domain === TARGET_DOMAIN
          ? { schedule_query_set_id: queryResult.querySetId, schedule_version: 'teche-clinic-v1' }
          : {}),
      },
    })),
  });
  const target = cohortResult.domains.find((domain) => domain.canonicalDomain === TARGET_DOMAIN);
  if (!target) throw new Error('seeded_teche_domain_missing');

  const appliedAt = new Date().toISOString();
  const { error: workspaceError } = await supabase.from('startup_workspaces').update({
    primary_domain: TARGET_DOMAIN,
    canonical_domain: TARGET_DOMAIN,
    updated_at: appliedAt,
  }).eq('id', config.startup_workspace_id);
  if (workspaceError) throw workspaceError;

  const { error: configUpdateError } = await supabase.from('client_benchmark_configs').update({
    benchmark_domain_id: target.id,
    topic: 'Clinical operations and practical AI consulting for private clinics',
    location: 'Quebec, Canada',
    query_set_id: queryResult.querySetId,
    competitor_list: competitors,
    cadence: 'monthly',
    metadata: {
      ...(config.metadata ?? {}),
      ...measurementMetadata,
      issue: 500,
      operating_role: 'challenger',
      internal_dogfood: true,
      excluded_from_revenue: true,
      public_claims_allowed: false,
      methodology_version: 'clinic-consulting-quebec-v1',
      comparison_roles: Object.fromEntries(preview.cohort.domains.map((domain) => [
        domain.domain,
        domain.metadata.comparison_role,
      ])),
      search_console_baseline: {
        window: '2026-08-13/2026-08-15',
        clicks: 1,
        impressions: 93,
        ctr_percent: 1.1,
        average_position: 36.9,
        observation: 'legacy EMR/EHR visibility dominates; new clinic AI/operations and French intent absent',
      },
      acquisition_experiment: {
        version: 'teche-bilingual-assessment-v1',
        variable: 'bilingual clinic operations assessment positioning',
        success_30d: 'at least 10 qualified profile actions or 2 booked assessments',
        stop_rule: 'redesign if qualified actions remain zero after 30 days despite increased visibility',
      },
      applied_at: appliedAt,
    },
    updated_at: appliedAt,
  }).eq('id', config.id);
  if (configUpdateError) throw configUpdateError;

  console.log(JSON.stringify({
    applied: true,
    querySetId: queryResult.querySetId,
    querySetVersion: bindingResult.binding.querySetVersion,
    queryCount: queryResult.queryCount,
    cohortDomainCount: cohortResult.domainCount,
    benchmarkDomainId: target.id,
    configId: config.id,
    startupWorkspaceId: config.startup_workspace_id,
    organizationContextVersion: context.contextVersion,
    publicClaimsAllowed: false,
    appliedAt,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
