import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAgencyReportSnapshot } from '@/lib/server/agency-report-snapshot';
import { DEFAULT_REPORT_SETTINGS } from '@/lib/server/report-settings';
import { agencyReportMeasurementContext } from '@/lib/server/testing/agency-report-fixtures';

const mocks = vi.hoisted(() => ({
  admin: null as any,
  bucketGet: vi.fn(),
}));

vi.mock('@/lib/server/cf-env', () => ({
  getScanApiEnv: vi.fn(async () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://db.example',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  })),
}));
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.admin),
}));
vi.mock('@/lib/server/report-branding-settings', () => ({
  resolveReportFilesBucket: vi.fn(async () => ({ get: mocks.bucketGet })),
}));

import { GET } from './route';

const REPORT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONFIG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLIENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const AGENCY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CONTEXT_VERSION = 'ocv1-sanomed-ca';
const QUERY_SET_ID = 'set-sanomed-ca';

const snapshot = buildAgencyReportSnapshot({
  configId: CONFIG_ID,
  clientName: 'SanoMed Solutions',
  domain: 'sanomedsolutions.com',
  topic: 'private preventative medicine',
  location: "Montreal's West Island, Quebec",
  windowDate: '2026-08',
  reportedAt: '2026-08-02T12:00:00.000Z',
  payloads: [{
    configId: CONFIG_ID, domain: 'sanomedsolutions.com', topic: 'private preventative medicine',
    location: "Montreal's West Island, Quebec", windowDate: '2026-08', platform: 'gemini', modelId: 'gemini-test',
    reportedAt: '2026-08-02T12:00:00.000Z', citationRate: 0, shareOfVoice: 0, queryCoverage: 1,
    visibilityPct: 0, industryRank: null,
    prompts: [{ queryKey: 'q1', queryText: 'Private preventative clinic in Pointe-Claire?', cited: false, rankPosition: null, topCompetitorInQuery: 'unionmd.ca' }],
    competitors: [], opportunities: [],
  }],
  sourceRunGroupIds: { gemini: 'run-gemini' },
  settings: DEFAULT_REPORT_SETTINGS,
  enabledPlatforms: ['gemini'],
  measurementContext: agencyReportMeasurementContext({
    ownerId: AGENCY_ID, clientId: CLIENT_ID, businessName: 'SanoMed Solutions',
    contextVersion: CONTEXT_VERSION, querySetId: QUERY_SET_ID,
    competitorDomains: ['unionmd.ca'],
  }),
});

function admin(contextVersion = CONTEXT_VERSION) {
  const rows: Record<string, Record<string, unknown>> = {
    gpm_reports: {
      id: REPORT_ID, config_id: CONFIG_ID, agency_client_id: CLIENT_ID,
      pdf_r2_key: 'private/sanomed.pdf', platform: 'combined', report_payload_version: '2',
      metadata: { snapshot, integrity: snapshot.integrity },
    },
    agency_clients: {
      id: CLIENT_ID, agency_account_id: AGENCY_ID, canonical_domain: 'sanomedsolutions.com',
      metadata: { client_summary_share_token: 'share-safe' },
    },
    benchmark_domains: { id: 'domain-sanomed', canonical_domain: 'sanomedsolutions.com' },
    client_benchmark_configs: {
      id: CONFIG_ID, benchmark_domain_id: 'domain-sanomed', query_set_id: QUERY_SET_ID,
      agency_account_id: AGENCY_ID, startup_workspace_id: null,
      metadata: {
        organization_context_version: contextVersion,
        query_set_version: snapshot.integrity.querySetVersion,
        competitor_cohort_version: snapshot.integrity.competitorCohortVersion,
      },
    },
  };
  return {
    from(table: string) {
      const chain: any = {
        select() { return chain; },
        eq() { return chain; },
        async maybeSingle() { return { data: rows[table] ?? null, error: null }; },
        insert() { return Promise.resolve({ error: null }); },
      };
      return chain;
    },
  };
}

describe('client report download integrity', () => {
  beforeEach(() => {
    mocks.bucketGet.mockReset();
    mocks.bucketGet.mockResolvedValue({ arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer });
  });

  it('serves the exact private PDF only when its immutable scope matches the current client context', async () => {
    mocks.admin = admin();
    const response = await GET(
      new Request(`https://getgeopulse.com/api/client-reports/${REPORT_ID}/download?share=share-safe`),
      { params: Promise.resolve({ reportId: REPORT_ID }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('sanomed-solutions-ai-visibility-2026-08.pdf');
    expect(mocks.bucketGet).toHaveBeenCalledWith('private/sanomed.pdf');
  });

  it('fails closed before object storage when the active context is newer than the artifact', async () => {
    mocks.admin = admin('ocv1-sanomed-new-market');
    const response = await GET(
      new Request(`https://getgeopulse.com/api/client-reports/${REPORT_ID}/download?share=share-safe`),
      { params: Promise.resolve({ reportId: REPORT_ID }) },
    );
    expect(response.status).toBe(404);
    expect(mocks.bucketGet).not.toHaveBeenCalled();
  });
});
