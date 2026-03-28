import { describe, expect, it, vi } from 'vitest';
import {
  buildBenchmarkScheduleRunKey,
  buildScheduledBenchmarkRunLabel,
  executeBenchmarkScheduleSweep,
  parseBenchmarkScheduleConfig,
} from './benchmark-schedule';

describe('benchmark schedule helpers', () => {
  it('parses the scheduled benchmark config from env', () => {
    const config = parseBenchmarkScheduleConfig({
      BENCHMARK_SCHEDULE_ENABLED: 'true',
      BENCHMARK_SCHEDULE_QUERY_SET_ID: 'set-1',
      BENCHMARK_SCHEDULE_MODEL_ID: 'gemini-2.5-flash-lite',
      BENCHMARK_SCHEDULE_RUN_MODES: 'ungrounded_inference,grounded_site,invalid',
      BENCHMARK_SCHEDULE_DOMAIN_LIMIT: '15',
      BENCHMARK_SCHEDULE_VERSION: 'daily-v1',
    });

    expect(config).toEqual({
      enabled: true,
      querySetId: 'set-1',
      modelId: 'gemini-2.5-flash-lite',
      runModes: ['ungrounded_inference', 'grounded_site'],
      domainLimit: 15,
      scheduleVersion: 'daily-v1',
    });
  });

  it('builds deterministic scheduled run labels and schedule keys', () => {
    const label = buildScheduledBenchmarkRunLabel({
      windowDate: '2026-03-28',
      domain: {
        id: 'domain-1',
        domain: 'www.geopulse.ai',
        canonical_domain: 'geopulse.ai',
        site_url: 'https://www.geopulse.ai/',
        display_name: 'GeoPulse',
        vertical: null,
        subvertical: null,
        geo_region: null,
        is_customer: true,
        is_competitor: false,
        metadata: {},
        created_at: '2026-03-28T00:00:00.000Z',
        updated_at: '2026-03-28T00:00:00.000Z',
      },
      querySet: {
        id: 'set-1',
        name: 'Brand Baseline',
        vertical: null,
        version: 'v1',
        description: null,
        status: 'active',
        metadata: {},
        created_at: '2026-03-28T00:00:00.000Z',
      },
      modelId: 'gemini-2.5-flash-lite',
      runMode: 'grounded_site',
    });

    expect(label).toBe(
      'scheduled-2026-03-28-geopulse-ai-brand-baseline-v1-grounded-site-gemini-2-5-flash-lite'
    );
    expect(
      buildBenchmarkScheduleRunKey({
        windowDate: '2026-03-28',
        scheduleVersion: 'v1',
        domainId: 'domain-1',
        querySetId: 'set-1',
        modelId: 'gemini-2.5-flash-lite',
        runMode: 'grounded_site',
      })
    ).toBe(
      'benchmark-schedule:v1:2026-03-28:domain-1:set-1:gemini-2.5-flash-lite:grounded_site'
    );
  });

  it('launches one scheduled run per domain and run mode while skipping duplicates', async () => {
    const runBenchmarkGroup = vi.fn().mockResolvedValue({
      runGroupId: 'run-1',
      queryRunCount: 6,
      skippedQueryCount: 0,
    });
    const repo = {
      getQuerySetById: vi.fn().mockResolvedValue({
        id: 'set-1',
        name: 'brand-baseline',
        vertical: null,
        version: 'v1',
        description: null,
        status: 'active',
        metadata: {},
        created_at: '2026-03-28T00:00:00.000Z',
      }),
      listCustomerDomainsForBenchmarkScheduling: vi.fn().mockResolvedValue([
        {
          id: 'domain-1',
          domain: 'www.geopulse.ai',
          canonical_domain: 'geopulse.ai',
          site_url: 'https://www.geopulse.ai/',
          display_name: 'GeoPulse',
          vertical: null,
          subvertical: null,
          geo_region: null,
          is_customer: true,
          is_competitor: false,
          metadata: {},
          created_at: '2026-03-28T00:00:00.000Z',
          updated_at: '2026-03-28T00:00:00.000Z',
        },
      ]),
      getRunGroupByScheduleKey: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing-run' }),
    };

    const summary = await executeBenchmarkScheduleSweep({
      repo,
      runBenchmarkGroup: runBenchmarkGroup as any,
      supabase: {},
      adapter: {} as any,
      config: {
        enabled: true,
        querySetId: 'set-1',
        modelId: 'gemini-2.5-flash-lite',
        runModes: ['ungrounded_inference', 'grounded_site'],
        domainLimit: 10,
        scheduleVersion: 'v1',
      },
      now: new Date('2026-03-28T12:00:00.000Z'),
    });

    expect(summary).toEqual({
      enabled: true,
      querySetId: 'set-1',
      modelId: 'gemini-2.5-flash-lite',
      scheduleVersion: 'v1',
      windowDate: '2026-03-28',
      domainCount: 1,
      launchedRuns: 1,
      skippedExistingRuns: 1,
    });
    expect(runBenchmarkGroup).toHaveBeenCalledTimes(1);
    expect(runBenchmarkGroup).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        domainId: 'domain-1',
        querySetId: 'set-1',
        modelId: 'gemini-2.5-flash-lite',
        runMode: 'ungrounded_inference',
        runScope: 'scheduled_internal_benchmark',
        runMetadata: expect.objectContaining({
          trigger_source: 'worker_cron',
          schedule_version: 'v1',
          schedule_window_utc: '2026-03-28',
        }),
      }),
      {}
    );
  });
});
