import { z } from 'zod';
import { assessCommercialReadiness } from '../intelligence/commercial-readiness';

const querySchema = z.object({
  queryKey: z.string().min(1),
  queryText: z.string().min(1),
  intentType: z.enum(['direct', 'comparative', 'discovery']),
  topic: z.string().min(1),
  weight: z.number().positive(),
  metadata: z.object({
    language: z.enum(['en-CA', 'fr-CA']),
    frame: z.string().min(1),
  }).passthrough(),
});

const querySetSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  vertical: z.literal('healthcare'),
  description: z.string().min(1),
  status: z.literal('active'),
  metadata: z.object({
    operating_role: z.literal('challenger'),
    internal_only: z.literal(true),
    public_claims_allowed: z.literal(false),
    minimum_comparable_domains: z.number().int().min(50),
  }).passthrough(),
  queries: z.array(querySchema).length(20),
});

const comparisonRoleSchema = z.enum([
  'target_subject',
  'direct_consultancy',
  'adjacent_consultancy',
  'product_substitute',
]);

const domainSchema = z.object({
  siteUrl: z.string().url(),
  domain: z.string().min(1),
  displayName: z.string().min(1),
  subvertical: z.string().min(1),
  geoRegion: z.string().min(1),
  isCustomer: z.boolean().optional(),
  isCompetitor: z.boolean().optional(),
  metadata: z.object({
    comparison_role: comparisonRoleSchema,
    source_urls: z.array(z.string().url()).min(1),
    schedule_enabled: z.boolean(),
  }).passthrough(),
});

const cohortSchema = z.object({
  name: z.string().min(1),
  vertical: z.literal('healthcare'),
  description: z.string().min(1),
  metadata: z.object({
    operating_role: z.literal('challenger'),
    internal_only: z.literal(true),
    public_claims_allowed: z.literal(false),
    schedule_enabled: z.literal(false),
  }).passthrough(),
  domains: z.array(domainSchema).min(4),
});

export type ClinicConsultingQueryFixture = z.infer<typeof querySetSchema>;
export type ClinicConsultingCohortFixture = z.infer<typeof cohortSchema>;

export function buildClinicConsultingChallengerPreview(
  queryInput: unknown,
  cohortInput: unknown,
) {
  const querySet = querySetSchema.parse(queryInput);
  const cohort = cohortSchema.parse(cohortInput);
  const queryKeys = new Set(querySet.queries.map((query) => query.queryKey));
  if (queryKeys.size !== querySet.queries.length) throw new Error('duplicate_query_keys');

  const languages = querySet.queries.reduce<Record<'en-CA' | 'fr-CA', number>>(
    (counts, query) => ({ ...counts, [query.metadata.language]: counts[query.metadata.language] + 1 }),
    { 'en-CA': 0, 'fr-CA': 0 },
  );
  if (languages['en-CA'] !== 10 || languages['fr-CA'] !== 10) {
    throw new Error('query_set_must_be_balanced_10_en_10_fr');
  }

  const targets = cohort.domains.filter((domain) => domain.metadata.comparison_role === 'target_subject');
  if (targets.length !== 1 || targets[0]?.domain !== 'techehealthservices.com') {
    throw new Error('teche_must_be_the_single_target_subject');
  }
  if (!targets[0].metadata.schedule_enabled) throw new Error('teche_schedule_must_be_enabled');
  if (cohort.domains.some((domain) =>
    domain.metadata.comparison_role !== 'target_subject' && domain.metadata.schedule_enabled
  )) throw new Error('pilot_schedules_target_only');

  const roles = cohort.domains.reduce<Record<string, number>>((counts, domain) => ({
    ...counts,
    [domain.metadata.comparison_role]: (counts[domain.metadata.comparison_role] ?? 0) + 1,
  }), {});
  const readiness = assessCommercialReadiness({
    canonicalVertical: 'healthcare',
    cohortDomainCount: cohort.domains.length,
    scheduledDomainCount: 1,
    completedDomainCount: 0,
    eligibleWindowCount: 0,
    ineligibleWindowCount: 0,
    latestEligibleObservedAt: null,
    protocolVariantCount: 0,
    verifiedInterventionCount: 0,
  });

  return {
    querySet,
    cohort,
    summary: {
      queryCount: querySet.queries.length,
      languages,
      domainCount: cohort.domains.length,
      scheduledDomains: ['techehealthservices.com'],
      roles,
      aggregateClaims: readiness.aggregateClaims,
      claimBlockers: readiness.blockers,
    },
  } as const;
}
