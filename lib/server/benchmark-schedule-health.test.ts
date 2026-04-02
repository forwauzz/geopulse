import { describe, expect, it } from 'vitest';
import {
  buildBenchmarkScheduleHealthSummary,
  buildRecentBenchmarkWindowDates,
} from './benchmark-schedule-health';
import type { BenchmarkRunListRow } from './benchmark-admin-data';

function makeRun(
  id: string,
  windowDate: string,
  runMode: 'ungrounded_inference' | 'grounded_site',
  triggerSource: string
): BenchmarkRunListRow {
  return {
    id,
    query_set_id: 'set-1',
    label: `scheduled-${windowDate}`,
    run_scope: 'scheduled_internal_benchmark',
    model_set_version: 'gemini-2.5-flash-lite',
    status: 'completed',
    notes: null,
    metadata: {
      schedule_version: 'law-firms-business-counsel-v1',
      schedule_window_utc: windowDate,
      run_mode: runMode,
      trigger_source: triggerSource,
    },
    started_at: null,
    completed_at: null,
    created_at: `${windowDate}:00:00.000Z`,
    domain_id: 'domain-1',
    domain: 'www.example.com',
    canonical_domain: 'example.com',
    site_url: 'https://www.example.com/',
    display_name: 'Example',
    query_set_name: 'law-firms-business-counsel',
    query_set_version: 'v1',
    query_coverage: 1,
    citation_rate: runMode === 'grounded_site' ? 0.5 : 0.25,
    measured_domain_citation_rate: runMode === 'grounded_site' ? 0.5 : 0.25,
    share_of_voice: runMode === 'grounded_site' ? 0.5 : null,
  };
}

describe('benchmark schedule health', () => {
  it('builds recent window dates from the latest window', () => {
    expect(
      buildRecentBenchmarkWindowDates({
        latestWindowDate: '2026-03-31T12',
        windowHours: 12,
        count: 4,
      })
    ).toEqual(['2026-03-31T12', '2026-03-31T00', '2026-03-30T12', '2026-03-30T00']);
  });

  it('marks missing windows and reports trigger sources', () => {
    const runs = [
      makeRun('run-1', '2026-03-31T00', 'ungrounded_inference', 'worker_cron'),
      makeRun('run-2', '2026-03-31T00', 'grounded_site', 'worker_cron'),
      makeRun('run-3', '2026-03-30T12', 'ungrounded_inference', 'manual_run_now'),
      makeRun('run-4', '2026-03-30T12', 'grounded_site', 'manual_run_now'),
    ];

    const summary = buildBenchmarkScheduleHealthSummary({
      runs,
      querySetId: 'set-1',
      modelId: 'gemini-2.5-flash-lite',
      scheduleVersion: 'law-firms-business-counsel-v1',
      windowHours: 12,
      windowDates: ['2026-03-31T12', '2026-03-31T00', '2026-03-30T12'],
    });

    expect(summary.windows).toEqual([
      {
        windowDate: '2026-03-31T12',
        domainCount: 0,
        pairedDomainCount: 0,
        runCount: 0,
        triggerSources: [],
        statuses: [],
        latestCreatedAt: null,
        missing: true,
      },
      {
        windowDate: '2026-03-31T00',
        domainCount: 1,
        pairedDomainCount: 1,
        runCount: 2,
        triggerSources: ['worker_cron'],
        statuses: ['completed'],
        latestCreatedAt: '2026-03-31T00:00:00.000Z',
        missing: false,
      },
      {
        windowDate: '2026-03-30T12',
        domainCount: 1,
        pairedDomainCount: 1,
        runCount: 2,
        triggerSources: ['manual_run_now'],
        statuses: ['completed'],
        latestCreatedAt: '2026-03-30T12:00:00.000Z',
        missing: false,
      },
    ]);
  });
});
