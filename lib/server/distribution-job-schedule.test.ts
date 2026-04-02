import { describe, expect, it, vi } from 'vitest';
import {
  parseDistributionScheduleConfig,
  runScheduledDistributionDispatch,
} from './distribution-job-schedule';

const baseEnv = {
  SCAN_CACHE: undefined,
  NEXT_PUBLIC_SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  DISTRIBUTION_ENGINE_UI_ENABLED: 'true',
  DISTRIBUTION_ENGINE_WRITE_ENABLED: 'true',
  DISTRIBUTION_ENGINE_BACKGROUND_ENABLED: 'true',
  DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT: '25',
  TURNSTILE_SECRET_KEY: '',
  GEMINI_API_KEY: '',
  GEMINI_MODEL: '',
  GEMINI_ENDPOINT: '',
  BENCHMARK_EXECUTION_PROVIDER: '',
  BENCHMARK_EXECUTION_API_KEY: '',
  BENCHMARK_EXECUTION_MODEL: '',
  BENCHMARK_EXECUTION_ENABLED_MODELS: '',
  BENCHMARK_EXECUTION_ENDPOINT: '',
  SCAN_QUEUE: undefined,
  DISTRIBUTION_QUEUE: undefined,
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  STRIPE_PRICE_ID_DEEP_AUDIT: '',
  RESEND_API_KEY: '',
  RESEND_FROM_EMAIL: '',
  KIT_API_KEY: '',
  BUTTONDOWN_API_KEY: '',
  GHOST_ADMIN_API_URL: '',
  GHOST_ADMIN_API_KEY: '',
  GHOST_ADMIN_API_VERSION: '',
  NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
  RECONCILE_SECRET: '',
  DEEP_AUDIT_DEFAULT_PAGE_LIMIT: '',
  DEEP_AUDIT_BROWSER_RENDER_MODE: '',
  DEEP_AUDIT_INTERNAL_REWRITE_ENABLED: '',
  DEEP_AUDIT_INTERNAL_REWRITE_MODEL: '',
};

describe('distribution schedule helpers', () => {
  it('parses the background dispatch config and clamps the batch limit', () => {
    expect(
      parseDistributionScheduleConfig({
        DISTRIBUTION_ENGINE_UI_ENABLED: 'true',
        DISTRIBUTION_ENGINE_WRITE_ENABLED: 'true',
        DISTRIBUTION_ENGINE_BACKGROUND_ENABLED: 'true',
        DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT: '250',
      } as any)
    ).toEqual({
      enabled: true,
      batchLimit: 100,
    });
  });

  it('returns null when background dispatch is disabled', () => {
    expect(
      parseDistributionScheduleConfig({
        DISTRIBUTION_ENGINE_UI_ENABLED: 'true',
        DISTRIBUTION_ENGINE_WRITE_ENABLED: 'true',
        DISTRIBUTION_ENGINE_BACKGROUND_ENABLED: 'false',
        DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT: '20',
      } as any)
    ).toBeNull();
  });

  it('skips scheduled dispatch when the UI flag is off', async () => {
    const log = vi.fn();

    const summary = await runScheduledDistributionDispatch(
      {} as any,
      {
        ...baseEnv,
        DISTRIBUTION_ENGINE_UI_ENABLED: 'false',
      } as any,
      {
        createRepository: vi.fn(),
        structuredLog: log,
        structuredError: vi.fn(),
      }
    );

    expect(summary).toEqual({
      status: 'skipped_ui_flag',
      batchLimit: 25,
      scanned: 0,
      dispatched: 0,
      succeeded: 0,
      failed: 0,
    });
    expect(log).toHaveBeenCalledWith(
      'distribution_job_schedule_skipped',
      expect.objectContaining({ reason: 'ui_flag_off', batch_limit: 25 }),
      'info'
    );
  });

  it('enqueues due jobs with the configured batch limit when all flags are enabled', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();
    const repo = {
      listDispatchableJobs: vi.fn().mockResolvedValue([{ id: 'job-row-1' }, { id: 'job-row-2' }]),
    };

    const summary = await runScheduledDistributionDispatch(
      {} as any,
      {
        ...baseEnv,
        DISTRIBUTION_QUEUE: { send },
      } as any,
      {
        createRepository: () => repo as any,
        structuredLog: log,
        structuredError: vi.fn(),
      }
    );

    expect(summary).toEqual({
      status: 'completed',
      batchLimit: 25,
      scanned: 2,
      dispatched: 2,
      succeeded: 0,
      failed: 0,
    });
    expect(repo.listDispatchableJobs).toHaveBeenCalledWith({ limit: 25 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(JSON.stringify({ v: 1, distributionJobId: 'job-row-1' }));
    expect(log).toHaveBeenCalledWith(
      'distribution_job_schedule_completed',
      expect.objectContaining({
        batch_limit: 25,
        scanned: 2,
        enqueued: 2,
      }),
      'info'
    );
  });
});
