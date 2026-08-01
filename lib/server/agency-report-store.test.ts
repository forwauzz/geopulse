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

  it('stores one private, idempotent combined snapshot and holds delivery while verification is off', async () => {
    const inserted: Record<string, unknown>[] = [];
    const gpmRows: Array<{ id: string; pdf_r2_key: string | null; window_date: string }> = [];
    const updated: Record<string, unknown>[] = [];
    const supabase = {
      from(table: string) {
        if (table === 'agency_accounts') {
          return { select: () => query(() => ({ id: 'agency-1', metadata: { report: { comparisonMonths: 3 } } })) };
        }
        if (table === 'agency_clients') {
          return { select: () => query(() => ({
            id: 'client-1', name: 'Clinic Co', display_name: null,
            metadata: { client_summary_share_token: 'share-secret', report: { promptKeys: ['q1', 'q2'] } },
          })) };
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
            gpmRows.push({ id: 'report-1', pdf_r2_key: String(row['pdf_r2_key']), window_date: String(row['window_date']) });
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
      env: { NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com', GPM_REPORT_DELIVERY_ENABLED: 'false' },
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
      artifact_kind: 'agency_report_v2', email_status: 'held_delivery_disabled',
      delivery_url_kind: 'revocable_client_summary',
      snapshot: { version: '2', clientName: 'Clinic Co', engines: [{ key: 'chatgpt' }, { key: 'gemini' }] },
    });
    expect(first.secureReportUrl).toContain('/client-summary/client-1?share=share-secret');
    expect(sendAgencyReportEmail).not.toHaveBeenCalled();
    expect(updated).toHaveLength(0);
  });
});
