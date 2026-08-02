import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GEO_PULSE_BRAND } from '../../workers/report/report-branding';

vi.mock('./geo-performance-report-data', () => ({
  buildGpmReportPayload: vi.fn(async (args: Record<string, string>) => ({
    configId: args.configId,
    domain: args.domain,
    topic: args.topic,
    location: args.location,
    windowDate: args.windowDate,
    platform: args.platform,
    modelId: `internal-${args.platform}`,
    reportedAt: '2026-08-01T12:00:00.000Z',
    citationRate: args.platform === 'chatgpt' ? 0.5 : 1,
    shareOfVoice: 0,
    queryCoverage: 1,
    visibilityPct: args.platform === 'chatgpt' ? 0.5 : 1,
    industryRank: null,
    prompts: [
      { queryKey: 'q1', queryText: 'Question one', cited: true, rankPosition: 1, topCompetitorInQuery: null },
      { queryKey: 'q2', queryText: 'Question two', cited: args.platform !== 'chatgpt', rankPosition: null, topCompetitorInQuery: 'other.example' },
    ],
    competitors: [],
    opportunities: [],
  })),
}));
vi.mock('./agency-report-pdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./agency-report-pdf')>();
  return { ...actual, buildAgencyReportPdf: vi.fn(async () => new Uint8Array([1, 2, 3])) };
});
vi.mock('../../workers/report/resolve-report-brand', () => ({
  resolveReportBrand: vi.fn(async () => ({ brand: GEO_PULSE_BRAND, logoBytes: null })),
}));
vi.mock('../../workers/report/agency-report-email-delivery', () => ({
  sendAgencyReportEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock('./agency-report-context-gate', () => ({
  appendAgencyReportCandidateQuarantine: vi.fn(async () => undefined),
  loadAgencyReportContextGate: vi.fn(async () => ({
    status: 'compatible',
    context: {
      owner: { type: 'agency_account', id: 'agency-1' },
      organization: { displayName: 'Clinic Co' },
    },
    binding: {
      organizationIdentityId: '11111111-1111-4111-8111-111111111111',
      contextId: 'context-test', contextVersion: 'ocv1-test', contextHash: 'fnv1a32:deadbeef',
      canonicalDomain: 'clinic.example', category: 'private healthcare clinic',
      marketScope: 'local', countryCode: 'CA', subdivisionCode: 'CA-QC', locality: 'Montreal',
      serviceAreas: ['Montreal West Island'], languages: ['en-CA', 'fr-CA'], timezone: 'America/Toronto',
      querySetVersion: 'oqs1-deadbeef-g1', competitorCohortVersion: 'occ1-deadbeef',
      trackedCompetitorDomains: [],
    },
    querySet: { id: 'set-1', version: 'oqs1-deadbeef-g1', metadata: {} },
    sourceRuns: [],
  })),
}));

import { storeAgencyReport } from './agency-report-store';
import { sendAgencyReportEmail } from '../../workers/report/agency-report-email-delivery';

function query<T>(value: () => T) {
  const chain = {
    eq() { return chain; },
    order() { return chain; },
    limit() { return chain; },
    maybeSingle: async () => ({ data: value(), error: null }),
    then(resolve: (result: { data: T; error: null }) => unknown) {
      return Promise.resolve({ data: value(), error: null }).then(resolve);
    },
  };
  return chain;
}

describe('storeAgencyReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores one private, idempotent combined snapshot and honors a client review hold', async () => {
    const inserted: Record<string, unknown>[] = [];
    const gpmRows: Array<{ id: string; pdf_r2_key: string | null; window_date: string; metadata: Record<string, unknown> }> = [];
    const updated: Record<string, unknown>[] = [];
    const supabase = {
      from(table: string) {
        if (table === 'agency_accounts') {
          return { select: () => query(() => ({ id: 'agency-1', metadata: { report: { comparisonMonths: 3 } } })) };
        }
        if (table === 'agency_clients') {
          return { select: () => query(() => ({
            id: 'client-1', name: 'Clinic Co', display_name: null,
            metadata: {
              client_summary_share_token: 'share-secret',
              report: { promptKeys: ['q1', 'q2'] },
              report_quarantine_hold: { status: 'held_pending_independent_review', issue: 326 },
            },
          })) };
        }
        if (table === 'benchmark_queries') {
          return { select: () => query(() => [{ id: 'q1' }, { id: 'q2' }]) };
        }
        if (table === 'benchmark_run_groups') {
          return { select: () => query(() => ({
            id: 'run-group', query_set_id: 'set-1', status: 'completed',
            metadata: { run_mode: 'blind_discovery' },
            startup_workspace_id: null, agency_account_id: 'agency-1',
          })) };
        }
        if (table === 'query_runs') {
          return { select: () => query(() => [
            {
              id: 'measure-1', query_id: 'q1', model_id: 'provider-model', status: 'completed',
              response_text: 'Answer one', response_metadata: {}, error_message: null,
              executed_at: '2026-08-01T12:00:00.000Z', created_at: '2026-08-01T11:59:00.000Z',
            },
            {
              id: 'measure-2', query_id: 'q2', model_id: 'provider-model', status: 'completed',
              response_text: 'Answer two', response_metadata: {}, error_message: null,
              executed_at: '2026-08-01T12:00:00.000Z', created_at: '2026-08-01T11:59:00.000Z',
            },
          ]) };
        }
        if (table === 'query_citations') {
          return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
        }
        expect(table).toBe('gpm_reports');
        return {
          select(columns: string) {
            return columns === 'metadata'
              ? query(() => [])
              : query(() => gpmRows[0] ?? null);
          },
          insert(row: Record<string, unknown>) {
            inserted.push(row);
            gpmRows.push({
              id: 'report-1', pdf_r2_key: String(row['pdf_r2_key']), window_date: String(row['window_date']),
              metadata: row['metadata'] as Record<string, unknown>,
            });
            return { select: () => ({ single: async () => ({ data: { id: 'report-1' }, error: null }) }) };
          },
          update(row: Record<string, unknown>) {
            updated.push(row);
            return { eq: async () => ({ error: null }) };
          },
        };
      },
    };
    const puts: Array<{ key: string; cacheControl: string | undefined }> = [];
    const bucket = {
      async put(key: string, _bytes: Uint8Array, options?: { httpMetadata?: { cacheControl?: string } }) {
        puts.push({ key, cacheControl: options?.httpMetadata?.cacheControl });
      },
    };
    const config = {
      id: 'config-1', startup_workspace_id: null, agency_account_id: 'agency-1', benchmark_domain_id: 'domain-1',
      topic: 'specialist care', location: 'Toronto', query_set_id: 'set-1', competitor_list: [], cadence: 'monthly' as const,
      platforms_enabled: ['chatgpt', 'gemini'], report_email: 'client@example.com', metadata: {},
      created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z',
    };
    const input = {
      supabase: supabase as never,
      config,
      platformRuns: [
        { platform: 'chatgpt' as const, runGroupId: 'run-a' },
        { platform: 'gemini' as const, runGroupId: 'run-b' },
      ],
      windowDate: '2026-08', measuredCanonicalDomain: 'clinic.example', bucket,
      env: { NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com', GPM_REPORT_DELIVERY_ENABLED: 'true' },
    };

    const first = await storeAgencyReport(input);
    const second = await storeAgencyReport(input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(inserted).toHaveLength(1);
    expect(puts).toHaveLength(1);
    expect(puts[0]?.cacheControl).toBe('private, no-store');
    expect(inserted[0]).toMatchObject({
      platform: 'combined', pdf_url: null, report_payload_version: '2', agency_client_id: 'client-1',
    });
    expect(inserted[0]?.['metadata']).toMatchObject({
      artifact_kind: 'agency_report_v2', email_status: 'held_client_review',
      provider_quality_version: 'provider-quality-v1',
      provider_quality: [
        { platform: 'chatgpt', status: 'measured', expectedQueryCount: 2, validQueryCount: 2 },
        { platform: 'gemini', status: 'measured', expectedQueryCount: 2, validQueryCount: 2 },
      ],
      delivery_blocked: true,
      delivery_block_reason: 'client_report_sharing_held',
      delivery_url_kind: 'revocable_client_summary',
      integrity: {
        version: 'agency-report-integrity-v1',
        configId: 'config-1',
        contextVersion: 'ocv1-test',
        querySetId: 'set-1',
        competitorCohortVersion: 'occ1-deadbeef',
        denominator: { questions: 2, evaluations: 4, citedEvaluations: 3 },
      },
      snapshot: {
        version: '2',
        clientName: 'Clinic Co',
        configuredEngines: ['chatgpt', 'gemini'],
        engines: [{ key: 'chatgpt' }, { key: 'gemini' }],
        unavailableEngines: [],
      },
    });
    expect(first.secureReportUrl).toContain('/client-summary/client-1?share=share-secret');
    expect(sendAgencyReportEmail).not.toHaveBeenCalled();
    expect(updated).toHaveLength(0);
  });

  it('excludes an incomplete provider instead of scoring it as zero', async () => {
    const inserted: Record<string, unknown>[] = [];
    function filteredQuery<T>(value: (filters: Record<string, unknown>) => T) {
      const filters: Record<string, unknown> = {};
      const chain = {
        eq(column: string, filter: unknown) { filters[column] = filter; return chain; },
        order() { return chain; },
        limit() { return chain; },
        in(column: string, filter: unknown) { filters[column] = filter; return chain; },
        maybeSingle: async () => ({ data: value(filters), error: null }),
        then(resolve: (result: { data: T; error: null }) => unknown) {
          return Promise.resolve({ data: value(filters), error: null }).then(resolve);
        },
      };
      return chain;
    }
    const supabase = {
      from(table: string) {
        if (table === 'agency_accounts') return { select: () => query(() => null) };
        if (table === 'agency_clients') return { select: () => query(() => null) };
        if (table === 'benchmark_queries') {
          return { select: () => filteredQuery(() => [{ id: 'q1' }, { id: 'q2' }]) };
        }
        if (table === 'benchmark_run_groups') {
          return { select: () => filteredQuery((filters) => ({
            id: String(filters['id']), query_set_id: 'set-1',
            status: filters['id'] === 'run-gemini' ? 'failed' : 'completed',
            metadata: { run_mode: 'blind_discovery' },
            startup_workspace_id: null, agency_account_id: 'agency-1',
          })) };
        }
        if (table === 'query_runs') {
          return { select: () => filteredQuery((filters) => filters['run_group_id'] === 'run-gemini'
            ? [
              {
                id: 'gemini-1', query_id: 'q1', model_id: 'gemini-model', status: 'failed',
                response_text: null, response_metadata: {}, error_message: 'provider unavailable',
                executed_at: null, created_at: '2026-08-01T11:59:00.000Z',
              },
            ]
            : [
              {
                id: 'chatgpt-1', query_id: 'q1', model_id: 'chatgpt-model', status: 'completed',
                response_text: 'Answer one', response_metadata: {}, error_message: null,
                executed_at: '2026-08-01T12:00:00.000Z', created_at: '2026-08-01T11:59:00.000Z',
              },
              {
                id: 'chatgpt-2', query_id: 'q2', model_id: 'chatgpt-model', status: 'completed',
                response_text: 'Answer two', response_metadata: {}, error_message: null,
                executed_at: '2026-08-01T12:00:00.000Z', created_at: '2026-08-01T11:59:00.000Z',
              },
            ]) };
        }
        if (table === 'query_citations') {
          return { select: () => filteredQuery(() => []) };
        }
        expect(table).toBe('gpm_reports');
        return {
          select(columns: string) {
            return columns === 'metadata' ? query(() => []) : query(() => null);
          },
          insert(row: Record<string, unknown>) {
            inserted.push(row);
            return { select: () => ({ single: async () => ({ data: { id: 'report-2' }, error: null }) }) };
          },
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      },
    };
    const result = await storeAgencyReport({
      supabase: supabase as never,
      config: {
        id: 'config-1', startup_workspace_id: null, agency_account_id: 'agency-1', benchmark_domain_id: 'domain-1',
        topic: 'managed IT', location: 'Montreal', query_set_id: 'set-1', competitor_list: [], cadence: 'monthly',
        platforms_enabled: ['chatgpt', 'gemini'], report_email: null, metadata: {},
        created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z',
      },
      platformRuns: [
        { platform: 'chatgpt', runGroupId: 'run-chatgpt' },
        { platform: 'gemini', runGroupId: 'run-gemini' },
      ],
      windowDate: '2026-08',
      measuredCanonicalDomain: 'msp.example',
      env: {},
    });

    expect(result.snapshot.engines.map((engine) => engine.key)).toEqual(['chatgpt']);
    expect(result.snapshot.unavailableEngines).toEqual(['gemini']);
    expect(result.snapshot.evaluationsTracked).toBe(2);
    expect(result.snapshot.combinedVisibilityPct).toBe(0.5);
    expect(inserted[0]?.['metadata']).toMatchObject({
      provider_quality: [
        { platform: 'chatgpt', status: 'measured', validQueryCount: 2 },
        { platform: 'gemini', status: 'unavailable', validQueryCount: 0 },
      ],
    });
  });
});
