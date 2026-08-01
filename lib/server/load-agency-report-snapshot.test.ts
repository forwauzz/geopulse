import { describe, expect, it } from 'vitest';
import { loadLatestAgencyReport } from './load-agency-report-snapshot';
import { buildAgencyReportSnapshot } from './agency-report-snapshot';
import { DEFAULT_REPORT_SETTINGS } from './report-settings';

type Row = Record<string, unknown>;

function makeSupabase(seed: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let orderColumn: string | null = null;
      let ascending = true;
      let limitCount: number | null = null;
      const rows = () => {
        const result = [...(seed[table] ?? [])].filter((row) => filters.every((filter) => filter(row)));
        if (orderColumn) {
          result.sort((a, b) => String(a[orderColumn!] ?? '').localeCompare(String(b[orderColumn!] ?? '')));
          if (!ascending) result.reverse();
        }
        return limitCount === null ? result : result.slice(0, limitCount);
      };
      const chain: any = {
        select() { return chain; },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return chain;
        },
        order(column: string, options?: { ascending?: boolean }) {
          orderColumn = column;
          ascending = options?.ascending !== false;
          return chain;
        },
        limit(value: number) {
          limitCount = value;
          return chain;
        },
        async maybeSingle() {
          return { data: rows()[0] ?? null, error: null };
        },
        then(resolve: (value: { data: Row[]; error: null }) => unknown) {
          return Promise.resolve({ data: rows(), error: null }).then(resolve);
        },
      };
      return chain;
    },
  };
}

describe('loadLatestAgencyReport', () => {
  it('skips a newer quarantined artifact and returns the latest eligible report', async () => {
    const snapshot = buildAgencyReportSnapshot({
      configId: 'config-1',
      clientName: 'Clinic',
      domain: 'clinic.example',
      topic: 'clinic',
      location: 'Montreal, Quebec',
      windowDate: '2026-08',
      reportedAt: '2026-08-01T01:00:00.000Z',
      payloads: [{
        configId: 'config-1', domain: 'clinic.example', topic: 'clinic', location: 'Montreal, Quebec',
        windowDate: '2026-08', platform: 'gemini', modelId: 'gemini-test',
        reportedAt: '2026-08-01T01:00:00.000Z', citationRate: 0, shareOfVoice: 0,
        queryCoverage: 1, visibilityPct: 0, industryRank: null,
        prompts: [{
          queryKey: 'q1', queryText: 'Best clinic in Montreal?', cited: false,
          rankPosition: null, topCompetitorInQuery: 'other.example',
        }],
        competitors: [], opportunities: [],
      }],
      sourceRunGroupIds: { gemini: 'run-safe' },
      settings: DEFAULT_REPORT_SETTINGS,
    });
    const db = makeSupabase({
      agency_clients: [{ id: 'client-1', agency_account_id: 'agency-1', canonical_domain: 'clinic.example' }],
      benchmark_domains: [{ id: 'domain-1', canonical_domain: 'clinic.example' }],
      client_benchmark_configs: [{ id: 'config-1', agency_account_id: 'agency-1', benchmark_domain_id: 'domain-1' }],
      gpm_reports: [
        {
          id: 'unsafe', config_id: 'config-1', agency_client_id: 'client-1', platform: 'combined',
          report_payload_version: '2', generated_at: '2026-08-02T00:00:00.000Z', pdf_r2_key: 'unsafe.pdf',
          metadata: { quarantine_status: 'quarantined', snapshot },
        },
        {
          id: 'safe', config_id: 'config-1', agency_client_id: 'client-1', platform: 'combined',
          report_payload_version: '2', generated_at: '2026-08-01T00:00:00.000Z', pdf_r2_key: 'safe.pdf',
          metadata: { snapshot },
        },
      ],
    });

    const report = await loadLatestAgencyReport({ supabase: db, agencyClientId: 'client-1' });

    expect(report).toMatchObject({ reportId: 'safe', pdfR2Key: 'safe.pdf' });
  });
});
