import { describe, expect, it, vi } from 'vitest';
import {
  buildBenchmarkScheduleRunKey,
  buildScheduledBenchmarkRunLabel,
  executeBenchmarkScheduleSweep,
  parseBenchmarkScheduleConfig,
  previewBenchmarkScheduleSweep,
  toBenchmarkChallengerScheduleEnv,
  toBenchmarkScheduleWindowDate,
} from './benchmark-schedule';

describe('benchmark schedule helpers', () => {
  it('maps one explicit challenger lane without changing the primary config', () => {
    expect(parseBenchmarkScheduleConfig(toBenchmarkChallengerScheduleEnv({
      BENCHMARK_CHALLENGER_ENABLED: 'true',
      BENCHMARK_CHALLENGER_QUERY_SET_ID: 'clinic-set',
      BENCHMARK_CHALLENGER_MODEL_ID: 'sonar',
      BENCHMARK_CHALLENGER_RUN_MODES: 'blind_discovery',
      BENCHMARK_CHALLENGER_VERTICAL: 'healthcare',
      BENCHMARK_CHALLENGER_DOMAINS: 'techehealthservices.com',
      BENCHMARK_CHALLENGER_DOMAIN_LIMIT: '1',
      BENCHMARK_CHALLENGER_MAX_RUNS: '1',
      BENCHMARK_CHALLENGER_WINDOW_HOURS: '24',
      BENCHMARK_CHALLENGER_VERSION: 'teche-clinic-v1',
      BENCHMARK_CHALLENGER_INCLUDE_USER_PROMPTS: 'false',
    }))).toMatchObject({
      querySetId: 'clinic-set',
      modelId: 'sonar',
      runModes: ['blind_discovery'],
      vertical: 'healthcare',
      canonicalDomains: ['techehealthservices.com'],
      domainLimit: 1,
      maxRuns: 1,
      windowHours: 24,
      scheduleVersion: 'teche-clinic-v1',
      includeUserPrompts: false,
    });
  });

  it('fails closed when a challenger is enabled without explicit domains', () => {
    expect(parseBenchmarkScheduleConfig(toBenchmarkChallengerScheduleEnv({
      BENCHMARK_CHALLENGER_ENABLED: 'true',
      BENCHMARK_CHALLENGER_QUERY_SET_ID: 'clinic-set',
      BENCHMARK_CHALLENGER_MODEL_ID: 'sonar',
    }))).toBeNull();
  });

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
      BENCHMARK_SCHEDULE_QUERY_DELAY_MS: '3500',
    });

    expect(config).toEqual({
      enabled: true,
      querySetId: 'set-1',
      modelId: 'gemini-2.5-flash-lite',
      modelIds: ['gemini-2.5-flash-lite'],
      runModes: ['ungrounded_inference', 'grounded_site'],
      vertical: 'law_firms',
      seedPriorities: [1, 2],
      canonicalDomains: ['lw.com', 'kirkland.com'],
      domainLimit: 15,
      maxRuns: 30,
      maxFailures: 4,
      windowHours: 12,
      scheduleVersion: 'daily-v1',
      queryExecutionDelayMs: 3500,
      includeUserPrompts: true,
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
        modelIds: ['gemini-2.5-flash-lite'],
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

  it('runs every configured model lane per domain and run mode', async () => {
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

    const summary = await executeBenchmarkScheduleSweep({
      repo,
      runBenchmarkGroup: runBenchmarkGroup as any,
      supabase: {},
      adapter: {} as any,
      config: {
        enabled: true,
        querySetId: 'set-1',
        modelId: 'gemini-2.5-flash-lite',
        modelIds: ['gemini-2.5-flash-lite', 'gpt-4o-mini'],
        runModes: ['ungrounded_inference', 'grounded_site'],
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
    });

    // 1 domain × 2 run modes × 2 models
    expect(summary.launchedRuns).toBe(4);
    const launchedModels = runBenchmarkGroup.mock.calls.map((call) => call[1].modelId);
    expect(launchedModels.filter((m) => m === 'gpt-4o-mini')).toHaveLength(2);
    expect(launchedModels.filter((m) => m === 'gemini-2.5-flash-lite')).toHaveLength(2);
    // Idempotency keys stay distinct per model lane.
    const keys = runBenchmarkGroup.mock.calls.map((call) => call[1].runMetadata.schedule_run_key);
    expect(new Set(keys).size).toBe(4);
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
        modelIds: ['gemini-2.5-flash-lite'],
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
          cohort_definition_version: 'query-set-v1',
          schedule_subvertical: 'not_applicable',
          model_snapshot: 'gemini-2.5-flash-lite',
          prompt_version: 'benchmark-prompt-v1',
          citation_parser_version: 'benchmark-citation-parser-v1',
          metric_definition_version: 'benchmark-metrics-v2',
          query_execution_delay_ms: 0,
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
        modelIds: ['gemini-2.5-flash-lite'],
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
      modelIds: ['gemini-2.5-flash-lite'],
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
        modelIds: ['gemini-2.5-flash-lite'],
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

  it('stops the sweep after one persisted terminal provider-auth failure', async () => {
    const runBenchmarkGroup = vi.fn().mockResolvedValue({
      runGroupId: 'run-auth-failed',
      queryRunCount: 10,
      completedQueryCount: 0,
      failedQueryCount: 10,
      skippedQueryCount: 0,
      terminalProviderFailureCode: 'benchmark_perplexity_http_401',
    });
    const repo = {
      getQuerySetById: vi.fn().mockResolvedValue({
        id: 'set-1', name: 'msp-it-services-core', vertical: 'msp_it', version: 'v1',
        description: null, status: 'active', metadata: {}, created_at: '2026-08-22T00:00:00.000Z',
      }),
      listDomainsForBenchmarkScheduling: vi.fn().mockResolvedValue([
        {
          id: 'domain-1', domain: 'example.ca', canonical_domain: 'example.ca',
          site_url: 'https://example.ca/', display_name: 'Example MSP', vertical: 'msp_it',
          subvertical: null, geo_region: 'Quebec', is_customer: false, is_competitor: true,
          metadata: {}, created_at: '2026-08-22T00:00:00.000Z', updated_at: '2026-08-22T00:00:00.000Z',
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
        modelId: 'sonar',
        modelIds: ['sonar'],
        runModes: ['blind_discovery', 'ungrounded_inference', 'grounded_site'],
        vertical: 'msp_it',
        seedPriorities: [1],
        canonicalDomains: ['example.ca'],
        domainLimit: 10,
        maxRuns: 30,
        maxFailures: 5,
        windowHours: 12,
        scheduleVersion: 'msp-perplexity-v4-cohort10',
      },
      now: new Date('2026-08-22T12:00:00.000Z'),
    });

    expect(summary).toMatchObject({
      launchedRuns: 1,
      failedRuns: 1,
      stoppedEarly: true,
    });
    expect(runBenchmarkGroup).toHaveBeenCalledTimes(1);
  });

  it('counts persisted all-failed groups toward the configured failure cap', async () => {
    const runBenchmarkGroup = vi.fn().mockResolvedValue({
      runGroupId: 'run-transient-failed',
      queryRunCount: 10,
      completedQueryCount: 0,
      failedQueryCount: 10,
      skippedQueryCount: 0,
      terminalProviderFailureCode: null,
    });
    const repo = {
      getQuerySetById: vi.fn().mockResolvedValue({
        id: 'set-1', name: 'msp-it-services-core', vertical: 'msp_it', version: 'v1',
        description: null, status: 'active', metadata: {}, created_at: '2026-08-22T00:00:00.000Z',
      }),
      listDomainsForBenchmarkScheduling: vi.fn().mockResolvedValue([
        {
          id: 'domain-1', domain: 'example.ca', canonical_domain: 'example.ca',
          site_url: 'https://example.ca/', display_name: 'Example MSP', vertical: 'msp_it',
          subvertical: null, geo_region: 'Quebec', is_customer: false, is_competitor: true,
          metadata: {}, created_at: '2026-08-22T00:00:00.000Z', updated_at: '2026-08-22T00:00:00.000Z',
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
        modelId: 'sonar',
        modelIds: ['sonar'],
        runModes: ['blind_discovery', 'ungrounded_inference', 'grounded_site'],
        vertical: 'msp_it',
        seedPriorities: [1],
        canonicalDomains: ['example.ca'],
        domainLimit: 10,
        maxRuns: 30,
        maxFailures: 2,
        windowHours: 12,
        scheduleVersion: 'msp-perplexity-v4-cohort10',
      },
      now: new Date('2026-08-22T12:00:00.000Z'),
    });

    expect(summary).toMatchObject({
      launchedRuns: 2,
      failedRuns: 2,
      stoppedEarly: true,
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
        modelIds: ['gemini-2.5-flash-lite'],
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
