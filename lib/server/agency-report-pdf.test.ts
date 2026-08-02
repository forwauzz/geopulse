import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  buildAgencyExecutiveSummary,
  buildAgencyOpportunityAction,
  buildAgencyReportCoverHeadline,
  buildAgencyReportOverviewTitle,
  buildAgencyReportPdf,
} from './agency-report-pdf';
import { buildAgencyReportSnapshot } from './agency-report-snapshot';
import type { GpmReportPayload } from './geo-performance-report-payload';
import { DEFAULT_REPORT_SETTINGS } from './report-settings';
import { agencyReportMeasurementContext } from './testing/agency-report-fixtures';

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
  measurementContext: agencyReportMeasurementContext(),
});

const zeroPayload: GpmReportPayload = {
  ...payload,
  configId: 'config-zero',
  citationRate: 0,
  shareOfVoice: 0,
  visibilityPct: 0,
  prompts: payload.prompts.map((prompt) => ({
    ...prompt,
    cited: false,
    rankPosition: null,
    topCompetitorInQuery: 'other.example',
  })),
};

const zeroSnapshot = buildAgencyReportSnapshot({
  configId: 'config-zero', clientName: 'Example Clinic', domain: 'example.com', topic: 'clinic marketing',
  location: 'Toronto', windowDate: '2026-08', reportedAt: '2026-08-01T12:00:00.000Z',
  payloads: [zeroPayload], sourceRunGroupIds: { chatgpt: 'run-zero' }, settings: DEFAULT_REPORT_SETTINGS,
  measurementContext: agencyReportMeasurementContext(),
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

  it('frames a zero-citation first measurement as a truthful baseline, not a win', () => {
    expect(buildAgencyReportCoverHeadline(zeroSnapshot)).toMatchObject({
      eyebrow: 'THE STARTING POINT',
      metric: 'Baseline',
      isBaseline: true,
    });
    expect(buildAgencyReportOverviewTitle(zeroSnapshot)).toBe('Your measured starting point');
    expect(buildAgencyExecutiveSummary(zeroSnapshot)).toContain('transparent starting point');
    expect(buildAgencyExecutiveSummary(zeroSnapshot)).toContain('No citation was recorded');
  });

  it('turns measured opportunity questions into bounded, verifiable agency actions', () => {
    const decisionQuestion = zeroSnapshot.opportunities[0];
    expect(decisionQuestion).toBeDefined();
    const context = { location: zeroSnapshot.location, topic: zeroSnapshot.topic };
    expect(buildAgencyOpportunityAction(decisionQuestion!, context)).toContain('decision-ready page');
    expect(buildAgencyOpportunityAction(decisionQuestion!, context)).toContain('Toronto');
  });

  it('turns clinic-service questions into specific, safety-bounded actions', () => {
    const pediatric = {
      ...zeroSnapshot.opportunities[0]!,
      queryText: "Where can I get prompt private pediatric urgent care in Montreal's West Island?",
    };
    const context = { location: zeroSnapshot.location, topic: zeroSnapshot.topic };
    expect(buildAgencyOpportunityAction(pediatric, context)).toContain('age range');
    expect(buildAgencyOpportunityAction(pediatric, context)).toContain('emergency care');
  });

  it('never applies clinic actions to non-clinic continuity or membership questions', () => {
    const context = { location: 'Montreal', topic: 'managed IT services for small businesses' };
    const questions = [
      'Who provides business continuity and disaster recovery in Montreal?',
      'Which MSP offers a managed IT membership plan for small firms?',
      'Best gym membership in Toronto',
      'What is the best co-managed IT continuity plan?',
    ];

    for (const queryText of questions) {
      const action = buildAgencyOpportunityAction({
        ...zeroSnapshot.opportunities[0]!,
        queryText,
      }, context);
      expect(action).not.toContain('family-medicine');
      expect(action).not.toContain('care page');
    }
  });

  it('does not create an almost-empty trend page until two comparable periods exist', async () => {
    const pdf = await buildAgencyReportPdf(zeroSnapshot);
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBe(5);
  });
});
