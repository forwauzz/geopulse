import {
  evaluateOrganizationMeasurementCompatibility,
  type OrganizationMeasurementBinding,
  type OrganizationMeasurementBindingReason,
} from './organization-measurement-context';
import type { OrganizationOwnerType } from './organization-context';

export const AGENCY_REPORT_INTEGRITY_VERSION = 'agency-report-integrity-v1';

export type AgencyReportIntegrityReason =
  | OrganizationMeasurementBindingReason
  | 'canonical_domain_mismatch'
  | 'duplicate_platform'
  | 'provider_quality_invalid'
  | 'query_set_id_mismatch'
  | 'run_config_mismatch'
  | 'run_platform_mismatch'
  | 'run_tenant_mismatch'
  | 'run_window_mismatch'
  | 'snapshot_scope_mismatch'
  | 'integrity_record_missing'
  | 'integrity_fingerprint_mismatch'
  | 'artifact_client_mismatch'
  | 'artifact_tenant_mismatch'
  | 'artifact_context_stale'
  | 'artifact_query_set_stale'
  | 'artifact_competitor_cohort_stale';

export type AgencyReportSourceRun = {
  readonly platform: string;
  readonly runGroupId: string;
  readonly querySetId: string | null;
  readonly status: string | null;
  readonly agencyAccountId: string | null;
  readonly startupWorkspaceId: string | null;
  readonly metadata: unknown;
  readonly qualityStatus: 'measured' | 'unavailable';
};

export type AgencyReportCandidateAssessment = {
  readonly compatible: boolean;
  readonly reasons: readonly AgencyReportIntegrityReason[];
};

export type AgencyReportIntegrityRecord = {
  readonly version: typeof AGENCY_REPORT_INTEGRITY_VERSION;
  readonly configId: string;
  readonly organizationIdentityId: string;
  readonly contextId: string;
  readonly contextVersion: string;
  readonly contextHash: string;
  readonly ownerType: OrganizationOwnerType;
  readonly ownerId: string | null;
  readonly clientId: string | null;
  readonly businessName: string;
  readonly canonicalDomain: string;
  readonly category: string;
  readonly market: {
    readonly scope: string;
    readonly countryCode: string;
    readonly subdivisionCode: string | null;
    readonly locality: string | null;
    readonly serviceAreas: readonly string[];
    readonly languages: readonly string[];
    readonly timezone: string;
  };
  readonly querySetId: string;
  readonly querySetVersion: string;
  readonly competitorCohortVersion: string;
  readonly competitorDomains: readonly string[];
  readonly period: string;
  readonly availablePromptKeys: readonly string[];
  readonly selectedPromptKeys: readonly string[];
  readonly configuredEngines: readonly string[];
  readonly measuredEngines: readonly string[];
  readonly unavailableEngines: readonly string[];
  readonly sourceRunGroupIds: Readonly<Record<string, string>>;
  readonly settingsProfileVersion: string;
  readonly providerQualityVersion: string;
  readonly denominator: {
    readonly questions: number;
    readonly evaluations: number;
    readonly citedEvaluations: number;
  };
  readonly fingerprint: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim());
}

function canonicalDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '');
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function stableObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'fingerprint')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableObject(nested)])
  );
}

function fingerprint(value: unknown): string {
  const source = JSON.stringify(stableObject(value));
  let checksum = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    checksum ^= source.charCodeAt(index);
    checksum = Math.imul(checksum, 0x01000193);
  }
  return `${AGENCY_REPORT_INTEGRITY_VERSION}:${(checksum >>> 0).toString(16).padStart(8, '0')}`;
}

function tenantMatches(run: AgencyReportSourceRun, args: {
  readonly agencyAccountId: string | null;
  readonly startupWorkspaceId: string | null;
}): boolean {
  return run.agencyAccountId === args.agencyAccountId
    && run.startupWorkspaceId === args.startupWorkspaceId;
}

/** Pure creation-time gate. Provider failures may be unavailable; every included run must be compatible. */
export function assessAgencyReportCandidate(args: {
  readonly binding: OrganizationMeasurementBinding;
  readonly canonicalDomain: string;
  readonly windowDate: string;
  readonly config: {
    readonly id: string;
    readonly querySetId: string | null;
    readonly agencyAccountId: string | null;
    readonly startupWorkspaceId: string | null;
    readonly metadata: unknown;
    readonly competitorList: readonly string[];
  };
  readonly querySet: { readonly id: string; readonly version: string; readonly metadata: unknown } | null;
  readonly sourceRuns: readonly AgencyReportSourceRun[];
}): AgencyReportCandidateAssessment {
  const reasons = new Set<AgencyReportIntegrityReason>();
  if (canonicalDomain(args.canonicalDomain) !== args.binding.canonicalDomain) {
    reasons.add('canonical_domain_mismatch');
  }
  if (args.querySet?.id !== args.config.querySetId) reasons.add('query_set_id_mismatch');
  const base = evaluateOrganizationMeasurementCompatibility({
    binding: args.binding,
    configMetadata: args.config.metadata,
    querySet: args.querySet,
    competitorList: args.config.competitorList,
  });
  for (const reason of base.reasons) reasons.add(reason);

  const platforms = new Set<string>();
  for (const run of args.sourceRuns) {
    if (run.qualityStatus !== 'measured') continue;
    if (platforms.has(run.platform)) reasons.add('duplicate_platform');
    platforms.add(run.platform);
    if (run.status !== 'completed') reasons.add('provider_quality_invalid');
    if (run.querySetId !== args.config.querySetId) reasons.add('query_set_id_mismatch');
    if (!tenantMatches(run, args.config)) reasons.add('run_tenant_mismatch');
    const metadata = record(run.metadata);
    const runCompatibility = evaluateOrganizationMeasurementCompatibility({
      binding: args.binding,
      configMetadata: args.config.metadata,
      querySet: args.querySet,
      competitorList: args.config.competitorList,
      runMetadata: metadata,
    });
    for (const reason of runCompatibility.reasons) reasons.add(reason);
    if (metadata['gpm_config_id'] !== args.config.id) reasons.add('run_config_mismatch');
    if (metadata['gpm_platform'] !== run.platform) reasons.add('run_platform_mismatch');
    if (metadata['gpm_window_date'] !== args.windowDate) reasons.add('run_window_mismatch');
  }
  if (!args.sourceRuns.some((run) => run.qualityStatus === 'measured')) {
    reasons.add('provider_quality_invalid');
  }
  return { compatible: reasons.size === 0, reasons: [...reasons].sort() };
}

export function buildAgencyReportIntegrityRecord(args: Omit<AgencyReportIntegrityRecord, 'version' | 'fingerprint'>): AgencyReportIntegrityRecord {
  const normalized = {
    ...args,
    businessName: args.businessName.trim(),
    canonicalDomain: canonicalDomain(args.canonicalDomain),
    market: {
      ...args.market,
      serviceAreas: sortedUnique(args.market.serviceAreas),
      languages: sortedUnique(args.market.languages),
    },
    competitorDomains: sortedUnique(args.competitorDomains.map(canonicalDomain)),
    availablePromptKeys: sortedUnique(args.availablePromptKeys),
    selectedPromptKeys: sortedUnique(args.selectedPromptKeys),
    configuredEngines: sortedUnique(args.configuredEngines),
    measuredEngines: sortedUnique(args.measuredEngines),
    unavailableEngines: sortedUnique(args.unavailableEngines),
    sourceRunGroupIds: Object.fromEntries(Object.entries(args.sourceRunGroupIds).sort(([a], [b]) => a.localeCompare(b))),
  };
  const withoutFingerprint = { version: AGENCY_REPORT_INTEGRITY_VERSION as typeof AGENCY_REPORT_INTEGRITY_VERSION, ...normalized };
  return { ...withoutFingerprint, fingerprint: fingerprint(withoutFingerprint) };
}

export function readAgencyReportIntegrity(value: unknown): AgencyReportIntegrityRecord | null {
  const row = record(value);
  const market = record(row['market']);
  const denominator = record(row['denominator']);
  if (row['version'] !== AGENCY_REPORT_INTEGRITY_VERSION
    || !text(row['organizationIdentityId'])
    || !text(row['configId'])
    || !text(row['contextId'])
    || !text(row['contextVersion'])
    || !text(row['contextHash'])
    || !['startup_workspace', 'agency_account', 'agency_client', 'internal_benchmark'].includes(String(row['ownerType']))
    || !text(row['businessName'])
    || !text(row['canonicalDomain'])
    || !text(row['category'])
    || !text(row['querySetId'])
    || !text(row['querySetVersion'])
    || !text(row['competitorCohortVersion'])
    || !text(row['period'])
    || !text(row['settingsProfileVersion'])
    || !text(row['providerQualityVersion'])
    || !text(row['fingerprint'])
    || !text(market['scope'])
    || !text(market['countryCode'])
    || !text(market['timezone'])
    || !stringArray(market['serviceAreas'])
    || !stringArray(market['languages'])
    || !stringArray(row['competitorDomains'])
    || !stringArray(row['availablePromptKeys'])
    || !stringArray(row['selectedPromptKeys'])
    || !stringArray(row['configuredEngines'])
    || !stringArray(row['measuredEngines'])
    || !stringArray(row['unavailableEngines'])
    || typeof row['sourceRunGroupIds'] !== 'object'
    || Object.values(record(row['sourceRunGroupIds'])).some((value) => !text(value))
    || !Number.isInteger(denominator['questions']) || Number(denominator['questions']) < 1
    || !Number.isInteger(denominator['evaluations']) || Number(denominator['evaluations']) < 1
    || !Number.isInteger(denominator['citedEvaluations']) || Number(denominator['citedEvaluations']) < 0
    || Number(denominator['citedEvaluations']) > Number(denominator['evaluations'])) return null;
  const candidate = value as AgencyReportIntegrityRecord;
  return fingerprint(candidate) === candidate.fingerprint ? candidate : null;
}

export function evaluateStoredAgencyReportIntegrity(args: {
  readonly integrity: unknown;
  readonly snapshot?: {
    readonly configId: string;
    readonly domain: string;
    readonly windowDate: string;
    readonly profileVersion: string;
    readonly questionsTracked: number;
    readonly evaluationsTracked: number;
    readonly evaluationsCited: number;
    readonly questions: readonly { readonly queryKey: string }[];
    readonly engines: readonly { readonly key: string; readonly sourceRunGroupId: string }[];
    readonly unavailableEngines: readonly string[];
    readonly integrity?: unknown;
  };
  readonly expected?: {
    readonly configId: string;
    readonly clientId: string | null;
    readonly canonicalDomain: string;
    readonly ownerType: OrganizationOwnerType;
    readonly ownerId: string | null;
    readonly querySetId: string;
    readonly contextVersion: string;
    readonly querySetVersion: string;
    readonly competitorCohortVersion: string;
  };
}): AgencyReportCandidateAssessment {
  const row = record(args.integrity);
  const integrity = readAgencyReportIntegrity(args.integrity);
  const reasons = new Set<AgencyReportIntegrityReason>();
  if (!integrity) {
    reasons.add(text(row['fingerprint']) ? 'integrity_fingerprint_mismatch' : 'integrity_record_missing');
    return { compatible: false, reasons: [...reasons] };
  }
  if (args.snapshot) {
    const sourceIds = Object.fromEntries(args.snapshot.engines.map((engine) => [engine.key, engine.sourceRunGroupId]));
    const embeddedIntegrity = args.snapshot.integrity
      ? readAgencyReportIntegrity(args.snapshot.integrity)
      : null;
    if (integrity.configId !== args.snapshot.configId
      || (embeddedIntegrity && embeddedIntegrity.fingerprint !== integrity.fingerprint)
      || (args.snapshot.configId !== args.expected?.configId && args.expected)
      || canonicalDomain(args.snapshot.domain) !== integrity.canonicalDomain
      || args.snapshot.windowDate !== integrity.period
      || args.snapshot.profileVersion !== integrity.settingsProfileVersion
      || args.snapshot.questionsTracked !== integrity.denominator.questions
      || args.snapshot.evaluationsTracked !== integrity.denominator.evaluations
      || args.snapshot.evaluationsCited !== integrity.denominator.citedEvaluations
      || JSON.stringify(sortedUnique(args.snapshot.questions.map((question) => question.queryKey))) !== JSON.stringify(integrity.selectedPromptKeys)
      || JSON.stringify(sortedUnique(args.snapshot.engines.map((engine) => engine.key))) !== JSON.stringify(integrity.measuredEngines)
      || JSON.stringify(sortedUnique(args.snapshot.unavailableEngines)) !== JSON.stringify(integrity.unavailableEngines)
      || JSON.stringify(sourceIds) !== JSON.stringify(integrity.sourceRunGroupIds)) {
      reasons.add('snapshot_scope_mismatch');
    }
  }
  if (args.expected) {
    if (integrity.configId !== args.expected.configId) reasons.add('snapshot_scope_mismatch');
    if (integrity.clientId !== args.expected.clientId) reasons.add('artifact_client_mismatch');
    if (integrity.canonicalDomain !== canonicalDomain(args.expected.canonicalDomain)) reasons.add('canonical_domain_mismatch');
    if (integrity.ownerType !== args.expected.ownerType || integrity.ownerId !== args.expected.ownerId) {
      reasons.add('artifact_tenant_mismatch');
    }
    if (integrity.contextVersion !== args.expected.contextVersion) reasons.add('artifact_context_stale');
    if (integrity.querySetId !== args.expected.querySetId) reasons.add('artifact_query_set_stale');
    if (integrity.querySetVersion !== args.expected.querySetVersion) reasons.add('artifact_query_set_stale');
    if (integrity.competitorCohortVersion !== args.expected.competitorCohortVersion) {
      reasons.add('artifact_competitor_cohort_stale');
    }
  }
  return { compatible: reasons.size === 0, reasons: [...reasons].sort() };
}
