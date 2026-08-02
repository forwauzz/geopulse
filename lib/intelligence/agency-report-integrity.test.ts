import { describe, expect, it } from 'vitest';
import {
  assessAgencyReportCandidate,
  buildAgencyReportIntegrityRecord,
  evaluateStoredAgencyReportIntegrity,
} from './agency-report-integrity';
import {
  organizationMeasurementMetadata,
  type OrganizationMeasurementBinding,
} from './organization-measurement-context';

const binding: OrganizationMeasurementBinding = {
  policyVersion: 'organization-measurement-v1',
  queryGeneratorVersion: 'organization-query-v1',
  organizationIdentityId: '11111111-1111-4111-8111-111111111111',
  contextId: 'sanomed-context',
  contextVersion: 'ocv1-sanomed-ca',
  contextHash: 'fnv1a32:deadbeef',
  canonicalDomain: 'sanomedsolutions.com',
  category: 'private preventative medicine clinic',
  services: ['preventative medicine', 'travel clinic'],
  marketScope: 'local',
  countryCode: 'CA',
  subdivisionCode: 'CA-QC',
  locality: 'Pointe-Claire',
  serviceAreas: ["Montreal's West Island"],
  languages: ['en-CA', 'fr-CA'],
  timezone: 'America/Toronto',
  buyer: 'patients seeking private preventative care',
  querySetVersion: 'oqs1-deadbeef-g1',
  competitorCohortVersion: 'occ1-deadbeef',
  trackedCompetitorDomains: ['unionmd.ca'],
};

const boundMetadata = organizationMeasurementMetadata(binding);
const config = {
  id: 'config-sanomed',
  querySetId: 'set-sanomed-ca',
  agencyAccountId: 'lifter-account',
  startupWorkspaceId: null,
  metadata: boundMetadata,
  competitorList: ['unionmd.ca'],
};
const querySet = { id: 'set-sanomed-ca', version: binding.querySetVersion, metadata: boundMetadata };

function sourceRun(platform: string, overrides: Record<string, unknown> = {}) {
  return {
    platform,
    runGroupId: `run-${platform}`,
    querySetId: 'set-sanomed-ca',
    status: 'completed',
    agencyAccountId: 'lifter-account',
    startupWorkspaceId: null,
    metadata: {
      ...boundMetadata,
      gpm_config_id: 'config-sanomed',
      gpm_platform: platform,
      gpm_window_date: '2026-08',
    },
    qualityStatus: 'measured' as const,
    ...overrides,
  };
}

describe('agency report integrity', () => {
  it('admits a compatible multi-engine Canadian SanoMed baseline', () => {
    const result = assessAgencyReportCandidate({
      binding,
      canonicalDomain: 'sanomedsolutions.com',
      windowDate: '2026-08',
      config,
      querySet,
      sourceRuns: [sourceRun('gemini'), sourceRun('perplexity')],
    });
    expect(result).toEqual({ compatible: true, reasons: [] });
  });

  it('quarantines the UK-contaminated query set instead of blending it into Montreal', () => {
    const result = assessAgencyReportCandidate({
      binding,
      canonicalDomain: 'sanomedsolutions.com',
      windowDate: '2026-08',
      config,
      querySet: {
        id: 'set-sanomed-uk',
        version: 'legacy-uk-v1',
        metadata: { ...boundMetadata, market_country_code: 'GB', market_subdivision_code: null },
      },
      sourceRuns: [sourceRun('gemini', { querySetId: 'set-sanomed-uk' })],
    });
    expect(result.compatible).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      'query_set_id_mismatch', 'query_set_version_mismatch', 'market_mismatch',
    ]));
  });

  it('omits a missing provider without treating it as an incompatible zero', () => {
    const result = assessAgencyReportCandidate({
      binding,
      canonicalDomain: 'sanomedsolutions.com',
      windowDate: '2026-08',
      config,
      querySet,
      sourceRuns: [
        sourceRun('gemini'),
        sourceRun('perplexity', { status: 'failed', qualityStatus: 'unavailable' as const }),
      ],
    });
    expect(result).toEqual({ compatible: true, reasons: [] });
  });

  it('quarantines stale context, wrong competitor cohort, and wrong tenant sources', () => {
    const stale = assessAgencyReportCandidate({
      binding,
      canonicalDomain: 'sanomedsolutions.com',
      windowDate: '2026-08',
      config: { ...config, metadata: { ...boundMetadata, organization_context_version: 'ocv1-old' } },
      querySet,
      sourceRuns: [sourceRun('gemini')],
    });
    expect(stale.reasons).toContain('configuration_context_mismatch');

    const wrongCohort = assessAgencyReportCandidate({
      binding,
      canonicalDomain: 'sanomedsolutions.com',
      windowDate: '2026-08',
      config: { ...config, competitorList: ['uk-clinic.example'] },
      querySet,
      sourceRuns: [sourceRun('gemini')],
    });
    expect(wrongCohort.reasons).toContain('competitor_cohort_mismatch');

    const wrongTenant = assessAgencyReportCandidate({
      binding,
      canonicalDomain: 'sanomedsolutions.com',
      windowDate: '2026-08',
      config,
      querySet,
      sourceRuns: [sourceRun('gemini', { agencyAccountId: 'another-agency' })],
    });
    expect(wrongTenant.reasons).toContain('run_tenant_mismatch');
  });

  it('fails closed when a stored denominator or fingerprint is changed', () => {
    const integrity = buildAgencyReportIntegrityRecord({
      configId: 'config-sanomed',
      organizationIdentityId: binding.organizationIdentityId,
      contextId: binding.contextId,
      contextVersion: binding.contextVersion,
      contextHash: binding.contextHash,
      ownerType: 'agency_account', ownerId: 'lifter-account', clientId: 'sanomed-client',
      businessName: 'SanoMed Solutions', canonicalDomain: binding.canonicalDomain, category: binding.category,
      market: {
        scope: binding.marketScope, countryCode: binding.countryCode, subdivisionCode: binding.subdivisionCode,
        locality: binding.locality, serviceAreas: binding.serviceAreas, languages: binding.languages, timezone: binding.timezone,
      },
      querySetId: 'set-sanomed-ca', querySetVersion: binding.querySetVersion,
      competitorCohortVersion: binding.competitorCohortVersion, competitorDomains: binding.trackedCompetitorDomains,
      period: '2026-08', availablePromptKeys: ['q1'], selectedPromptKeys: ['q1'], configuredEngines: ['gemini'],
      measuredEngines: ['gemini'], unavailableEngines: [], sourceRunGroupIds: { gemini: 'run-gemini' },
      settingsProfileVersion: 'rp2-test', providerQualityVersion: 'provider-quality-v1',
      denominator: { questions: 1, evaluations: 1, citedEvaluations: 0 },
    });
    expect(evaluateStoredAgencyReportIntegrity({ integrity }).compatible).toBe(true);
    expect(evaluateStoredAgencyReportIntegrity({
      integrity: { ...integrity, denominator: { ...integrity.denominator, evaluations: 20 } },
    })).toMatchObject({ compatible: false, reasons: ['integrity_fingerprint_mismatch'] });
  });
});
