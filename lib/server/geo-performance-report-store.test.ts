import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./geo-performance-report-data', () => ({
  buildGpmReportPayload: vi.fn(async (args: Record<string, string>) => ({
    configId: args.configId,
    domain: args.measuredCanonicalDomain,
    topic: 'therapy',
    location: 'Vancouver',
    windowDate: args.windowDate,
    platform: args.platform,
    modelId: 'gemini-2.5-flash-lite',
    reportedAt: '2026-07-24T12:00:00.000Z',
    citationRate: 0.6,
    shareOfVoice: 0.3,
    queryCoverage: 1,
    visibilityPct: 0.6,
    industryRank: null,
    prompts: [],
    competitors: [],
    opportunities: [],
  })),
}));
vi.mock('./geo-performance-report-pdf', () => ({
  buildGpmReportPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

import { storeGpmReport } from './geo-performance-report-store';
import { buildGpmReportPdf } from './geo-performance-report-pdf';

describe('storeGpmReport versioning', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses immutable run ids for both the R2 artifact and database version key', async () => {
    const inserted: Record<string, unknown>[] = [];
    const supabase = {
      from(table: string) {
        if (table === 'agency_accounts') {
          return {
            select() {
              return {
                eq() {
                  return { maybeSingle: async () => ({ data: null, error: null }) };
                },
              };
            },
          };
        }
        expect(table).toBe('gpm_reports');
        return {
          insert(row: Record<string, unknown>) {
            inserted.push(row);
            return {
              select() {
                return { single: async () => ({ data: { id: 'report-1' }, error: null }) };
              },
            };
          },
        };
      },
    };
    const puts: string[] = [];
    const bucket = {
      async put(key: string) {
        puts.push(key);
      },
    };
    const config = {
      id: 'config-1',
      startup_workspace_id: null,
      agency_account_id: 'agency-1',
      benchmark_domain_id: 'domain-1',
      topic: 'therapy',
      location: 'Vancouver',
      query_set_id: 'set-1',
      competitor_list: [],
      cadence: 'monthly' as const,
      platforms_enabled: ['gemini'],
      report_email: null,
      metadata: {},
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    };

    await storeGpmReport({
      supabase: supabase as never,
      config,
      runGroupId: 'run-a',
      platform: 'gemini',
      windowDate: '2026-07',
      measuredCanonicalDomain: 'stabilitylab.com',
      bucket,
      env: { GPM_REPORT_R2_PUBLIC_BASE: 'https://reports.example' },
    });
    await storeGpmReport({
      supabase: supabase as never,
      config,
      runGroupId: 'run-b',
      platform: 'gemini',
      windowDate: '2026-07',
      measuredCanonicalDomain: 'stabilitylab.com',
      bucket,
      env: { GPM_REPORT_R2_PUBLIC_BASE: 'https://reports.example' },
    });

    expect(puts).toEqual([
      'gpm-reports/config-1/2026-07-gemini-run-a.pdf',
      'gpm-reports/config-1/2026-07-gemini-run-b.pdf',
    ]);
    expect(inserted.map((row) => row['window_date'])).toEqual([
      '2026-07@run-a',
      '2026-07@run-b',
    ]);
    expect(inserted[0]?.['metadata']).toMatchObject({
      cadence_window: '2026-07',
      report_run_group_id: 'run-a',
    });
  });

  it('loads the saved agency logo and fetches the measured engine logo for the PDF', async () => {
    const inserted: Record<string, unknown>[] = [];
    const logoBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const engineBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const supabase = {
      from(table: string) {
        if (table === 'agency_accounts') {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: {
                        metadata: {
                          brand: {
                            companyName: 'Lifter',
                            primary: '#3c88af',
                            logoKey: 'brand-logos/lifter/logo.png',
                            logoMime: 'image/png',
                          },
                        },
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }
        return {
          insert(row: Record<string, unknown>) {
            inserted.push(row);
            return {
              select() {
                return { single: async () => ({ data: { id: 'report-2' }, error: null }) };
              },
            };
          },
        };
      },
    };
    const bucket = {
      async put() {},
      async get() {
        return { arrayBuffer: async () => logoBytes.buffer };
      },
    };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(engineBytes, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    const config = {
      id: 'config-2',
      startup_workspace_id: null,
      agency_account_id: 'agency-2',
      benchmark_domain_id: 'domain-2',
      topic: 'urology',
      location: 'Montreal',
      query_set_id: 'set-2',
      competitor_list: [],
      cadence: 'monthly' as const,
      platforms_enabled: ['perplexity'],
      report_email: null,
      metadata: {},
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    };

    await storeGpmReport({
      supabase: supabase as never,
      config,
      runGroupId: 'run-c',
      platform: 'perplexity',
      windowDate: '2026-07',
      measuredCanonicalDomain: 'steinbergurology.com',
      bucket,
      env: {
        GPM_REPORT_R2_PUBLIC_BASE: 'https://reports.example',
        NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
      },
    });

    expect(fetchSpy).toHaveBeenCalledWith('https://getgeopulse.com/ai-engines/perplexity.jpg');
    expect(vi.mocked(buildGpmReportPdf)).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'steinbergurology.com' }),
      expect.objectContaining({
        logoBytes,
        platformLogoBytes: engineBytes,
        brand: expect.objectContaining({ companyName: 'Lifter' }),
      })
    );
    expect(inserted).toHaveLength(1);
  });
});
