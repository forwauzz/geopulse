import { describe, expect, it, vi } from 'vitest';
import {
  buildBenchmarkScheduleRunKey,
  buildScheduledBenchmarkRunLabel,
  executeBenchmarkScheduleSweep,
  parseBenchmarkScheduleConfig,
  previewBenchmarkScheduleSweep,
  toBenchmarkScheduleWindowDate,
} from './benchmark-schedule';

describe('benchmark schedule helpers', () => {
  it('parses the scheduled benchmark config from env', () => {
    const config = parseBenchmarkScheduleConfig({
      BENCHMARK_SCHEDULE_ENABLED: 'true',
      BENCHMARK_SCHEDULE_QUERY_SET_ID: 'set-1',
      BENCHMARK_SCHEDULE_MODEL_ID: 'gemini-2.5-flash-lite',
      BENCHMARK_SCHEDULE_RUN_MODES: 'ungrounded_inference,grounded_site,invalid',
      BENCHMARK_SCHEDULE_VERTICAL: 'law_firms',
      BENCHMARK_SCHEDULE_SEED_PRIORITIES: '1,2,invalid',
      BENCHMARK_SCHEDULE_DOMAINS: 'lw.com, kirkland.com, LW.COM',
      BENCHMARK_SCHEDULE_DOMAIN_LIMIT: '15',
      BENCHMARK_SCHEDULE_MAX_RUNS: '30',
      BENCHMARK_SCHEDULE_MAX_FAILURES: '4',
      BENCHMARK_SCHEDULE_WINDOW_HOURS: '12',
      BENCHMARK_SCHEDULE_VERSION: 'daily-v1',
    });

    expect(config).toEqual({
      enabled: true,
      querySetId: 'set-1',
      modelId: 'gemini-2.5-flash-lite',
      runModes: ['ungrounded_inference', 'grounded_site'],
      vertical: 'law_firms',
      seedPriorities: [1, 2],
      canonicalDomains: ['lw.com', 'kirkland.com'],
      domainLimit: 15,
      maxRuns: 30,
      maxFailures: 4,
      windowHours: 12,
      scheduleVersion: 'daily-v1',
    });
  });

  it('uses half-day schedule window keys when window hours are reduced', () => {
    expect(toBenchmarkScheduleWindowDate(new Date('2026-03-28T02:00:00.000Z'), 12)).toBe(
      '2026-03-28T00'
    );
    expect(toBenchmarkScheduleWindowDate(new Date('2026-03-28T18:00:00.000Z'), 12)).toBe(
      '2026-03-28T12'
    );
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
      listDomainsForBenchmarkScheduling: vi.fn().mockResolvedValue([
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
        vertical: 'law_firms',
        seedPriorities: [1],
        canonicalDomains: ['lw.com'],
        domainLimit: 10,
        maxRuns: 10,
        maxFailures: 3,
        windowHours: 12,
        scheduleVersion: 'v1',
      },
      now: new Date('2026-03-28T12:00:00.000Z'),
    });

    expect(summary).toEqual({
      enabled: true,
      querySetId: 'set-1',
      modelId: 'gemini-2.5-flash-lite',
      scheduleVersion: 'v1',
      windowDate: '2026-03-28T12',
      domainCount: 1,
      launchedRuns: 1,
      skippedExistingRuns: 1,
      failedRuns: 0,
      stoppedEarly: false,
    });
    expect(runBenchmarkGroup).toHaveBeenCalledTimes(1);
    expect(repo.listDomainsForBenchmarkScheduling).toHaveBeenCalledWith({
      limit: 10,
      vertical: 'law_firms',
      seedPriorities: [1],
      canonicalDomains: ['lw.com'],
      requireScheduleEnabled: true,
    });
  });

  it('persists the provided trigger source in scheduled run metadata', async () => {
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
      listDomainsForBenchmarkScheduling: vi.fn().mockResolvedValue([
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
      getRunGroupByScheduleKey: vi.fn().mockResolvedValue(null),
    };

    await executeBenchmarkScheduleSweep({
      repo,
      runBenchmarkGroup: runBenchmarkGroup as any,
      supabase: {},
      adapter: {} as any,
      config: {
        enabled: true,
        querySetId: 'set-1',
        modelId: 'gemini-2.5-flash-lite',
        runModes: ['ungrounded_inference'],
        vertical: null,
        seedPriorities: [],
        canonicalDomains: [],
        domainLimit: 10,
        maxRuns: 10,
        maxFailures: 3,
        windowHours: 12,
        scheduleVersion: 'v1',
      },
      now: new Date('2026-03-28T12:00:00.000Z'),
      triggerSource: 'manual_run_now',
    });

    expect(runBenchmarkGroup).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        runMetadata: expect.objectContaining({
          trigger_source: 'manual_run_now',
        }),
      }),
      {}
    );
  });

  it('previews the configured schedule window and selected domains without launching runs', async () => {
    const repo = {
      getQuerySetById: vi.fn().mockResolvedValue({
        id: 'set-1',
        name: 'law-firms-p1-core',
        vertical: 'law_firms',
        version: 'v1',
        description: null,
        status: 'active',
        metadata: {},
        created_at: '2026-03-28T00:00:00.000Z',
      }),
      listDomainsForBenchmarkScheduling: vi.fn().mockResolvedValue([
        {
          id: 'domain-1',
          domain: 'www.lw.com',
          canonical_domain: 'lw.com',
          site_url: 'https://www.lw.com/',
          display_name: 'Latham & Watkins',
          vertical: 'law_firms',
          subvertical: null,
          geo_region: null,
          is_customer: false,
          is_competitor: false,
          metadata: { schedule_enabled: true, seed_priority: 1 },
          created_at: '2026-03-28T00:00:00.000Z',
          updated_at: '2026-03-28T00:00:00.000Z',
        },
      ]),
    };

    const preview = await previewBenchmarkScheduleSweep({
      repo: repo as any,
      config: {
        enabled: true,
        querySetId: 'set-1',
        modelId: 'gemini-2.5-flash-lite',
        runModes: ['ungrounded_inference', 'grounded_site'],
        vertical: 'law_firms',
        seedPriorities: [1],
        canonicalDomains: ['lw.com'],
        domainLimit: 21,
        maxRuns: 42,
        maxFailures: 5,
        windowHours: 12,
        scheduleVersion: 'law-firms-p1-v1',
      },
      now: new Date('2026-03-28T12:00:00.000Z'),
    });

    expect(preview).toEqual({
      enabled: true,
      querySetId: 'set-1',
      querySetName: 'law-firms-p1-core',
      querySetVersion: 'v1',
      modelId: 'gemini-2.5-flash-lite',
      scheduleVersion: 'law-firms-p1-v1',
      windowDate: '2026-03-28T12',
      vertical: 'law_firms',
      seedPriorities: [1],
      canonicalDomains: ['lw.com'],
      runModes: ['ungrounded_inference', 'grounded_site'],
      domainLimit: 21,
      maxRuns: 42,
      maxFailures: 5,
      windowHours: 12,
      domains: [
        {
          id: 'domain-1',
          canonical_domain: 'lw.com',
          site_url: 'https://www.lw.com/',
          vertical: 'law_firms',
        },
      ],
    });
  });

  it('continues after one failed scheduled run and records failure visibility', async () => {
    const runBenchmarkGroup = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce({
        runGroupId: 'run-2',
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
      listDomainsForBenchmarkScheduling: vi.fn().mockResolvedValue([
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
      getRunGroupByScheduleKey: vi.fn().mockResolvedValue(null),
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
        vertical: 'law_firms',
        seedPriorities: [1],
        canonicalDomains: [],
        domainLimit: 10,
        maxRuns: 10,
        maxFailures: 3,
        windowHours: 12,
        scheduleVersion: 'v1',
      },
      now: new Date('2026-03-28T12:00:00.000Z'),
    });

    expect(summary).toEqual({
      enabled: true,
      querySetId: 'set-1',
      modelId: 'gemini-2.5-flash-lite',
      scheduleVersion: 'v1',
      windowDate: '2026-03-28T12',
      domainCount: 1,
      launchedRuns: 1,
      skippedExistingRuns: 0,
      failedRuns: 1,
      stoppedEarly: false,
    });
    expect(runBenchmarkGroup).toHaveBeenCalledTimes(2);
  });

  it('stops early when the run cap is reached', async () => {
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
      listDomainsForBenchmarkScheduling: vi.fn().mockResolvedValue([
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
        {
          id: 'domain-2',
          domain: 'www.example.com',
          canonical_domain: 'example.com',
          site_url: 'https://www.example.com/',
          display_name: 'Example',
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
      getRunGroupByScheduleKey: vi.fn().mockResolvedValue(null),
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
        vertical: 'law_firms',
        seedPriorities: [1],
        canonicalDomains: [],
        domainLimit: 10,
        maxRuns: 1,
        maxFailures: 3,
        windowHours: 12,
        scheduleVersion: 'v1',
      },
      now: new Date('2026-03-28T12:00:00.000Z'),
    });

    expect(summary).toEqual({
      enabled: true,
      querySetId: 'set-1',
      modelId: 'gemini-2.5-flash-lite',
      scheduleVersion: 'v1',
      windowDate: '2026-03-28T12',
      domainCount: 2,
      launchedRuns: 1,
      skippedExistingRuns: 0,
      failedRuns: 0,
      stoppedEarly: true,
    });
    expect(runBenchmarkGroup).toHaveBeenCalledTimes(1);
  });
});
