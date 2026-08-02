import type { AgencyReportMeasurementContextInput } from '../agency-report-snapshot';

export function agencyReportMeasurementContext(
  overrides: Partial<AgencyReportMeasurementContextInput> = {}
): AgencyReportMeasurementContextInput {
  return {
    organizationIdentityId: '11111111-1111-4111-8111-111111111111',
    contextId: 'context-test',
    contextVersion: 'ocv1-test',
    contextHash: 'fnv1a32:deadbeef',
    ownerType: 'agency_account',
    ownerId: '22222222-2222-4222-8222-222222222222',
    clientId: '33333333-3333-4333-8333-333333333333',
    businessName: 'Example Clinic',
    category: 'private healthcare clinic',
    market: {
      scope: 'local',
      countryCode: 'CA',
      subdivisionCode: 'CA-QC',
      locality: 'Montreal',
      serviceAreas: ['Montreal West Island'],
      languages: ['en-CA', 'fr-CA'],
      timezone: 'America/Toronto',
    },
    querySetId: 'set-1',
    querySetVersion: 'oqs1-deadbeef-g1',
    competitorCohortVersion: 'occ1-deadbeef',
    competitorDomains: ['competitor.example'],
    providerQualityVersion: 'provider-quality-v1',
    ...overrides,
  };
}
