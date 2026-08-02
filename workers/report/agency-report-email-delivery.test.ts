import { describe, expect, it } from 'vitest';
import { buildAgencyReportEmailHtml } from './agency-report-email-delivery';
import { buildAgencyReportSnapshot } from '@/lib/server/agency-report-snapshot';
import { DEFAULT_REPORT_SETTINGS } from '@/lib/server/report-settings';
import { agencyReportMeasurementContext } from '@/lib/server/testing/agency-report-fixtures';

describe('agency report email', () => {
  it('uses the canonical combined snapshot and never exposes model identifiers', () => {
    const snapshot = buildAgencyReportSnapshot({
      configId: 'config-1', clientName: 'Clinic Co', domain: 'clinic.example', topic: 'specialist care',
      location: 'Toronto', windowDate: '2026-08',
      payloads: [{
        configId: 'config-1', domain: 'clinic.example', topic: 'specialist care', location: 'Toronto',
        windowDate: '2026-08', platform: 'chatgpt', modelId: 'secret-raw-model', reportedAt: '2026-08-01T00:00:00Z',
        citationRate: 1, shareOfVoice: 1, queryCoverage: 1, visibilityPct: 1, industryRank: 1,
        prompts: [{ queryKey: 'q1', queryText: 'Best clinic', cited: true, rankPosition: 1, topCompetitorInQuery: null }],
        competitors: [], opportunities: [],
      }],
      sourceRunGroupIds: { chatgpt: 'run-1' }, settings: DEFAULT_REPORT_SETTINGS,
      measurementContext: agencyReportMeasurementContext(),
    });
    const html = buildAgencyReportEmailHtml({ snapshot, secureReportUrl: 'https://example.test/secure' });
    expect(html).toContain('100%');
    expect(html).toContain('View the full client report');
    expect(html).not.toContain('secret-raw-model');
  });
});
