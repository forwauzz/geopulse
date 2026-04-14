import { describe, expect, it } from 'vitest';
import {
  buildBenchmarkScheduleMultiWindowSummary,
  buildBenchmarkScheduleWindowSummary,
  selectBenchmarkScheduleWindowOutliers,
} from './benchmark-schedule-window-summary';
import type { BenchmarkRunListRow } from './benchmark-admin-data';

function makeRun(partial: Partial<BenchmarkRunListRow>): BenchmarkRunListRow {
  return {
    id: 'run-1',
    query_set_id: 'set-1',
    label: 'scheduled',
    run_scope: 'scheduled_internal_benchmark',
    model_set_version: 'gemini-2.5-flash-lite',
    status: 'completed',
    notes: null,
    metadata: {
      schedule_version: 'law-firms-p1-v1',
      schedule_window_utc: '2026-03-29T12',
      run_mode: 'ungrounded_inference',
      exact_page_quality_rate: 0.5,
    },
    started_at: null,
    completed_at: null,
    created_at: '2026-03-29T12:00:00.000Z',
    domain_id: 'domain-1',
    domain: 'www.example.com',
    canonical_domain: 'example.com',
    site_url: 'https://www.example.com/',
    display_name: 'Example',
    query_set_name: 'law-firms-p1-core',
    query_set_version: 'v1',
    query_coverage: 1,
    citation_rate: 0.5,
    measured_domain_citation_rate: null,
    share_of_voice: 0.25,
    ...partial,
  };
}

describe('buildBenchmarkScheduleWindowSummary', () => {
  it('groups paired grounded and ungrounded runs for one window', () => {
    const runs: BenchmarkRunListRow[] = [
      makeRun({}),
      makeRun({
        id: 'run-2',
        metadata: {
          schedule_version: 'law-firms-p1-v1',
          schedule_window_utc: '2026-03-29T12',
          run_mode: 'grounded_site',
          exact_page_quality_rate: 0.75,
        },
        citation_rate: 0.75,
        share_of_voice: 0.5,
      }),
      makeRun({
        id: 'run-3',
        domain_id: 'domain-2',
        canonical_domain: 'another.com',
        site_url: 'https://www.another.com/',
      }),
    ];

    expect(
      buildBenchmarkScheduleWindowSummary({
        runs,
        querySetId: 'set-1',
        modelId: 'gemini-2.5-flash-lite',
        scheduleVersion: 'law-firms-p1-v1',
        windowDate: '2026-03-29T12',
      })
    ).toEqual({
      querySetId: 'set-1',
      modelId: 'gemini-2.5-flash-lite',
      scheduleVersion: 'law-firms-p1-v1',
      windowDate: '2026-03-29T12',
      domainCount: 2,
      pairedDomainCount: 1,
      domains: [
        {
          domainId: 'domain-2',
          canonicalDomain: 'another.com',
          siteUrl: 'https://www.another.com/',
          ungroundedRunGroupId: 'run-3',
          groundedRunGroupId: null,
          ungroundedCitationRate: 0.5,
          groundedCitationRate: null,
          ungroundedQueryCoverage: 1,
          groundedQueryCoverage: null,
          groundedShareOfVoice: null,
          groundedExactPageQualityRate: null,
        },
        {
          domainId: 'domain-1',
          canonicalDomain: 'example.com',
          siteUrl: 'https://www.example.com/',
          ungroundedRunGroupId: 'run-1',
          groundedRunGroupId: 'run-2',
          ungroundedCitationRate: 0.5,
          groundedCitationRate: 0.75,
          ungroundedQueryCoverage: 1,
          groundedQueryCoverage: 1,
          groundedShareOfVoice: 0.5,
          groundedExactPageQualityRate: 0.75,
        },
      ],
    });
  });

  it('selects the largest grounded winners and losers for inspection', () => {
    const summary = buildBenchmarkScheduleWindowSummary({
      runs: [
        makeRun({
          domain_id: 'domain-1',
          canonical_domain: 'winner.com',
          site_url: 'https://winner.com/',
          citation_rate: 0.25,
        }),
        makeRun({
          id: 'run-2',
          domain_id: 'domain-1',
          canonical_domain: 'winner.com',
          site_url: 'https://winner.com/',
          metadata: {
            schedule_version: 'law-firms-p1-v1',
            schedule_window_utc: '2026-03-29T12',
            run_mode: 'grounded_site',
            exact_page_quality_rate: 0,
          },
          citation_rate: 1,
        }),
        makeRun({
          id: 'run-3',
          domain_id: 'domain-2',
          canonical_domain: 'loser.com',
          site_url: 'https://loser.com/',
          citation_rate: 0.75,
        }),
        makeRun({
          id: 'run-4',
          domain_id: 'domain-2',
          canonical_domain: 'loser.com',
          site_url: 'https://loser.com/',
          metadata: {
            schedule_version: 'law-firms-p1-v1',
            schedule_window_utc: '2026-03-29T12',
            run_mode: 'grounded_site',
            exact_page_quality_rate: 0,
          },
          citation_rate: 0.125,
        }),
      ],
      querySetId: 'set-1',
      modelId: 'gemini-2.5-flash-lite',
      scheduleVersion: 'law-firms-p1-v1',
      windowDate: '2026-03-29T12',
    });

    expect(selectBenchmarkScheduleWindowOutliers(summary, 1)).toEqual({
      winners: [
        {
          canonicalDomain: 'winner.com',
          siteUrl: 'https://winner.com/',
          deltaCitationRate: 0.75,
          ungroundedCitationRate: 0.25,
          groundedCitationRate: 1,
          groundedExactPageQualityRate: 0,
          ungroundedRunGroupId: 'run-1',
          groundedRunGroupId: 'run-2',
        },
      ],
      losers: [
        {
          canonicalDomain: 'loser.com',
          siteUrl: 'https://loser.com/',
          deltaCitationRate: -0.625,
          ungroundedCitationRate: 0.75,
          groundedCitationRate: 0.125,
          groundedExactPageQualityRate: 0,
          ungroundedRunGroupId: 'run-3',
          groundedRunGroupId: 'run-4',
        },
      ],
    });
  });

  it('summarizes recurring performance across multiple explicit windows', () => {
    const runs: BenchmarkRunListRow[] = [
      makeRun({
        domain_id: 'domain-1',
        canonical_domain: 'winner.com',
        site_url: 'https://winner.com/',
        citation_rate: 0.25,
      }),
      makeRun({
        id: 'run-2',
        domain_id: 'domain-1',
        canonical_domain: 'winner.com',
        site_url: 'https://winner.com/',
        metadata: {
          schedule_version: 'law-firms-p1-v1',
          schedule_window_utc: '2026-03-29T12',
          run_mode: 'grounded_site',
          exact_page_quality_rate: 0,
        },
        citation_rate: 0.75,
      }),
      makeRun({
        id: 'run-3',
        domain_id: 'domain-1',
        canonical_domain: 'winner.com',
        site_url: 'https://winner.com/',
        metadata: {
          schedule_version: 'law-firms-p1-v1',
          schedule_window_utc: '2026-03-30T00',
          run_mode: 'ungrounded_inference',
          exact_page_quality_rate: 0,
        },
        citation_rate: 0.5,
      }),
      makeRun({
        id: 'run-4',
        domain_id: 'domain-1',
        canonical_domain: 'winner.com',
        site_url: 'https://winner.com/',
        metadata: {
          schedule_version: 'law-firms-p1-v1',
          schedule_window_utc: '2026-03-30T00',
          run_mode: 'grounded_site',
          exact_page_quality_rate: 0,
        },
        citation_rate: 1,
      }),
      makeRun({
        id: 'run-5',
        domain_id: 'domain-2',
        canonical_domain: 'loser.com',
        site_url: 'https://loser.com/',
        citation_rate: 0.75,
      }),
      makeRun({
        id: 'run-6',
        domain_id: 'domain-2',
        canonical_domain: 'loser.com',
        site_url: 'https://loser.com/',
        metadata: {
          schedule_version: 'law-firms-p1-v1',
          schedule_window_utc: '2026-03-29T12',
          run_mode: 'grounded_site',
          exact_page_quality_rate: 0,
        },
        citation_rate: 0.25,
      }),
      makeRun({
        id: 'run-7',
        domain_id: 'domain-2',
        canonical_domain: 'loser.com',
        site_url: 'https://loser.com/',
        metadata: {
          schedule_version: 'law-firms-p1-v1',
          schedule_window_utc: '2026-03-30T00',
          run_mode: 'ungrounded_inference',
          exact_page_quality_rate: 0,
        },
        citation_rate: 1,
      }),
      makeRun({
        id: 'run-8',
        domain_id: 'domain-2',
        canonical_domain: 'loser.com',
        site_url: 'https://loser.com/',
        metadata: {
          schedule_version: 'law-firms-p1-v1',
          schedule_window_utc: '2026-03-30T00',
          run_mode: 'grounded_site',
          exact_page_quality_rate: 0,
        },
        citation_rate: 0.5,
      }),
    ];

    expect(
      buildBenchmarkScheduleMultiWindowSummary({
        runs,
        querySetId: 'set-1',
        modelId: 'gemini-2.5-flash-lite',
        scheduleVersion: 'law-firms-p1-v1',
        windowDates: ['2026-03-29T12', '2026-03-30T00'],
      })
    ).toEqual({
      querySetId: 'set-1',
      modelId: 'gemini-2.5-flash-lite',
      scheduleVersion: 'law-firms-p1-v1',
      windowDates: ['2026-03-29T12', '2026-03-30T00'],
      windowCount: 2,
      pairedDomainCount: 2,
      domains: [
        {
          canonicalDomain: 'winner.com',
          siteUrl: 'https://winner.com/',
          pairedWindowCount: 2,
          positiveDeltaWindowCount: 2,
          negativeDeltaWindowCount: 0,
          zeroDeltaWindowCount: 0,
          averageDeltaCitationRate: 0.5,
          averageUngroundedCitationRate: 0.375,
          averageGroundedCitationRate: 0.875,
          nonZeroExactPageWindowCount: 0,
        },
        {
          canonicalDomain: 'loser.com',
          siteUrl: 'https://loser.com/',
          pairedWindowCount: 2,
          positiveDeltaWindowCount: 0,
          negativeDeltaWindowCount: 2,
          zeroDeltaWindowCount: 0,
          averageDeltaCitationRate: -0.5,
          averageUngroundedCitationRate: 0.875,
          averageGroundedCitationRate: 0.375,
          nonZeroExactPageWindowCount: 0,
        },
      ],
    });
  });
});
