import { describe, expect, it } from 'vitest';
import { buildAgencyReportPdf, buildAgencyExecutiveSummary } from './agency-report-pdf';
import { buildAgencyReportSnapshot } from './agency-report-snapshot';
import type { GpmReportPayload } from './geo-performance-report-payload';
import { DEFAULT_REPORT_SETTINGS } from './report-settings';

const payload: GpmReportPayload = {
  configId: 'config-1', domain: 'example.com', topic: 'clinic marketing', location: 'Toronto',
  windowDate: '2026-08', platform: 'chatgpt', modelId: 'raw-model-id-must-not-render',
  reportedAt: '2026-08-01T12:00:00.000Z', citationRate: 0.5, shareOfVoice: 0.5,
  queryCoverage: 1, visibilityPct: 0.5, industryRank: 1,
  prompts: [
    { queryKey: 'q1', queryText: 'Best specialist clinic in Toronto', cited: true, rankPosition: 1, topCompetitorInQuery: null },
    { queryKey: 'q2', queryText: 'Where to get specialist care', cited: false, rankPosition: null, topCompetitorInQuery: 'other.example' },
  ],
  competitors: [], opportunities: [],
};

const snapshot = buildAgencyReportSnapshot({
  configId: 'config-1', clientName: 'Example Clinic', domain: 'example.com', topic: 'clinic marketing',
  location: 'Toronto', windowDate: '2026-08', reportedAt: '2026-08-01T12:00:00.000Z',
  payloads: [payload], sourceRunGroupIds: { chatgpt: 'run-1' }, settings: DEFAULT_REPORT_SETTINGS,
});

describe('agency report artifact', () => {
  it('builds a wins-led executive readout from the exact snapshot', () => {
    const summary = buildAgencyExecutiveSummary(snapshot);
    expect(summary).toContain('1 of 2 measured AI answers (50%)');
    expect(summary).toContain('Best specialist clinic in Toronto');
    expect(summary).toContain('Where to get specialist care');
    expect(summary).not.toContain('raw-model-id-must-not-render');
  });

  it('renders a multi-page branded PDF without model identifiers', async () => {
    const pdf = await buildAgencyReportPdf(snapshot);
    expect(String.fromCharCode(...pdf.slice(0, 4))).toBe('%PDF');
    expect(pdf.byteLength).toBeGreaterThan(5_000);
  });
});
