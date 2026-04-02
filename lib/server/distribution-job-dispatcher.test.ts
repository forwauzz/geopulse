import { describe, expect, it, vi } from 'vitest';
import { ContentDestinationPublishError } from './content-destination-adapters';
import { dispatchDistributionJobById, dispatchDistributionJobs } from './distribution-job-dispatcher';

const baseEnv = {
  SCAN_CACHE: undefined,
  NEXT_PUBLIC_SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  DISTRIBUTION_ENGINE_UI_ENABLED: 'true',
  DISTRIBUTION_ENGINE_WRITE_ENABLED: 'true',
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
  KIT_API_KEY: 'kit_test_key',
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

describe('dispatchDistributionJobs', () => {
  it('dispatches due content-item jobs and records a successful attempt', async () => {
    const repo = {
      listDispatchableJobs: vi.fn().mockResolvedValue([
        {
          id: 'job-row-1',
          job_id: 'job_1',
          distribution_asset_id: 'asset-row-1',
          distribution_account_id: 'acct-row-1',
          publish_mode: 'draft',
          scheduled_for: null,
          status: 'queued',
          destination_url: null,
          provider_post_id: null,
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: null,
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-1',
        job_id: 'job_1',
        distribution_asset_id: 'asset-row-1',
        distribution_account_id: 'acct-row-1',
        publish_mode: 'draft',
        scheduled_for: null,
        status: 'queued',
        destination_url: null,
        provider_post_id: null,
        last_error: null,
        created_by_user_id: 'user-1',
        completed_at: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      updateJob: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'job-row-1',
          job_id: 'job_1',
          distribution_asset_id: 'asset-row-1',
          distribution_account_id: 'acct-row-1',
          publish_mode: 'draft',
          scheduled_for: null,
          status: 'processing',
          destination_url: null,
          provider_post_id: null,
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: null,
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'job-row-1',
          job_id: 'job_1',
          distribution_asset_id: 'asset-row-1',
          distribution_account_id: 'acct-row-1',
          publish_mode: 'draft',
          scheduled_for: null,
          status: 'published',
          destination_url: 'https://kit.com/p/1',
          provider_post_id: 'pub-1',
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: '2026-04-02T01:00:00.000Z',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T01:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-1',
        account_id: 'kit_founder',
        provider_name: 'kit',
        account_label: 'Founder Kit',
        external_account_id: null,
        status: 'connected',
        default_audience_id: null,
        metadata: {},
        connected_by_user_id: 'user-1',
        last_verified_at: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      getAssetById: vi.fn().mockResolvedValue({
        id: 'asset-row-1',
        asset_id: 'asset_1',
        content_item_id: 'content-row-1',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'newsletter_email',
        provider_family: 'newsletter',
        title: 'Newsletter',
        body_markdown: '# Title',
        body_plaintext: null,
        caption_text: null,
        status: 'approved',
        cta_url: null,
        metadata: {},
        created_by_user_id: 'user-1',
        approved_by_user_id: null,
        approved_at: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      listJobAttempts: vi.fn().mockResolvedValue([]),
      createJobAttempt: vi.fn().mockResolvedValue({}),
    };

    const supabase = {
      from(table: string) {
        expect(table).toBe('content_items');
        return {
          select() {
            return this;
          },
          eq() {
            return {
              maybeSingle: async () => ({
                data: {
                  id: 'content-row-1',
                  content_id: 'content_1',
                  slug: 'newsletter',
                  title: 'Newsletter',
                  status: 'draft',
                  content_type: 'newsletter',
                  target_persona: null,
                  primary_problem: null,
                  topic_cluster: null,
                  keyword_cluster: null,
                  cta_goal: 'free_scan',
                  source_type: 'internal_plus_research',
                  source_links: [],
                  brief_markdown: null,
                  draft_markdown: '# Draft body',
                  canonical_url: null,
                  metadata: {},
                  published_at: null,
                  created_at: '2026-04-02T00:00:00.000Z',
                  updated_at: '2026-04-02T00:00:00.000Z',
                },
                error: null,
              }),
            };
          },
        };
      },
    } as any;

    const publishDraft = vi.fn().mockResolvedValue({
      providerPublicationId: 'pub-1',
      destinationUrl: 'https://kit.com/p/1',
      status: 'drafted',
      metadata: {},
    });

    const summary = await dispatchDistributionJobs(
      supabase,
      baseEnv as any,
      { limit: 10 },
      {
        createRepository: () => repo as any,
        resolveAdapter: () => ({ publishDraft }) as any,
        structuredLog: vi.fn(),
        structuredError: vi.fn(),
      }
    );

    expect(summary).toEqual({
      scanned: 1,
      dispatched: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(publishDraft).toHaveBeenCalledOnce();
    expect(repo.createJobAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        distributionJobId: 'job-row-1',
        attemptNumber: 1,
        errorMessage: null,
      })
    );
  });

  it('marks unsupported jobs as failed and records the failure attempt', async () => {
    const repo = {
      listDispatchableJobs: vi.fn().mockResolvedValue([
        {
          id: 'job-row-2',
          job_id: 'job_2',
          distribution_asset_id: 'asset-row-2',
          distribution_account_id: 'acct-row-2',
          publish_mode: 'scheduled',
          scheduled_for: '2026-04-02T00:00:00.000Z',
          status: 'scheduled',
          destination_url: null,
          provider_post_id: null,
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: null,
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-2',
        job_id: 'job_2',
        distribution_asset_id: 'asset-row-2',
        distribution_account_id: 'acct-row-2',
        publish_mode: 'scheduled',
        scheduled_for: '2026-04-02T00:00:00.000Z',
        status: 'scheduled',
        destination_url: null,
        provider_post_id: null,
        last_error: null,
        created_by_user_id: 'user-1',
        completed_at: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      updateJob: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'job-row-2',
          job_id: 'job_2',
          distribution_asset_id: 'asset-row-2',
          distribution_account_id: 'acct-row-2',
          publish_mode: 'scheduled',
          scheduled_for: '2026-04-02T00:00:00.000Z',
          status: 'processing',
          destination_url: null,
          provider_post_id: null,
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: null,
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'job-row-2',
          job_id: 'job_2',
          distribution_asset_id: 'asset-row-2',
          distribution_account_id: 'acct-row-2',
          publish_mode: 'scheduled',
          scheduled_for: '2026-04-02T00:00:00.000Z',
          status: 'failed',
          destination_url: null,
          provider_post_id: null,
          last_error: 'Only content_item sourced assets are dispatchable in the current runtime.',
          created_by_user_id: 'user-1',
          completed_at: '2026-04-02T01:00:00.000Z',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T01:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-2',
        account_id: 'x_founder',
        provider_name: 'x',
        account_label: 'Founder X',
        external_account_id: null,
        status: 'connected',
        default_audience_id: null,
        metadata: {},
        connected_by_user_id: 'user-1',
        last_verified_at: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      getAssetById: vi.fn().mockResolvedValue({
        id: 'asset-row-2',
        asset_id: 'asset_2',
        content_item_id: null,
        source_type: 'benchmark_insight',
        source_key: 'bench-1',
        asset_type: 'thread_post',
        provider_family: 'x',
        title: 'Benchmark thread',
        body_markdown: null,
        body_plaintext: null,
        caption_text: null,
        status: 'approved',
        cta_url: null,
        metadata: {},
        created_by_user_id: 'user-1',
        approved_by_user_id: null,
        approved_at: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      listJobAttempts: vi.fn().mockResolvedValue([]),
      createJobAttempt: vi.fn().mockResolvedValue({}),
    };

    const summary = await dispatchDistributionJobs(
      {} as any,
      baseEnv as any,
      { limit: 10 },
      {
        createRepository: () => repo as any,
        resolveAdapter: vi.fn(),
        structuredLog: vi.fn(),
        structuredError: vi.fn(),
      }
    );

    expect(summary).toEqual({
      scanned: 1,
      dispatched: 1,
      succeeded: 0,
      failed: 1,
    });
    expect(repo.createJobAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        distributionJobId: 'job-row-2',
        attemptNumber: 1,
        errorMessage: 'Only content_item sourced assets are dispatchable in the current runtime.',
      })
    );
  });

  it('skips non-dispatchable jobs when processing by id from the queue path', async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-3',
        job_id: 'job_3',
        distribution_asset_id: 'asset-row-3',
        distribution_account_id: 'acct-row-3',
        publish_mode: 'draft',
        scheduled_for: null,
        status: 'published',
        destination_url: 'https://kit.com/p/3',
        provider_post_id: 'pub-3',
        last_error: null,
        created_by_user_id: 'user-1',
        completed_at: '2026-04-02T01:00:00.000Z',
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T01:00:00.000Z',
      }),
    };

    const summary = await dispatchDistributionJobById(
      {} as any,
      baseEnv as any,
      'job-row-3',
      {
        createRepository: () => repo as any,
        structuredLog: vi.fn(),
        structuredError: vi.fn(),
      }
    );

    expect(summary).toEqual({
      scanned: 1,
      dispatched: 0,
      succeeded: 0,
      failed: 0,
    });
  });

  it('puts retryable provider failures back into a dispatchable state', async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-4',
        job_id: 'job_4',
        distribution_asset_id: 'asset-row-4',
        distribution_account_id: 'acct-row-4',
        publish_mode: 'draft',
        scheduled_for: null,
        status: 'queued',
        destination_url: null,
        provider_post_id: null,
        last_error: null,
        created_by_user_id: 'user-1',
        completed_at: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      updateJob: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'job-row-4',
          job_id: 'job_4',
          distribution_asset_id: 'asset-row-4',
          distribution_account_id: 'acct-row-4',
          publish_mode: 'draft',
          scheduled_for: null,
          status: 'processing',
          destination_url: null,
          provider_post_id: null,
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: null,
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'job-row-4',
          job_id: 'job_4',
          distribution_asset_id: 'asset-row-4',
          distribution_account_id: 'acct-row-4',
          publish_mode: 'draft',
          scheduled_for: null,
          status: 'queued',
          destination_url: null,
          provider_post_id: null,
          last_error: 'Kit publish failed (429): rate limited',
          created_by_user_id: 'user-1',
          completed_at: null,
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-4',
        account_id: 'kit_founder',
        provider_name: 'kit',
        account_label: 'Founder Kit',
        external_account_id: null,
        status: 'connected',
        default_audience_id: null,
        metadata: {},
        connected_by_user_id: 'user-1',
        last_verified_at: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      getAssetById: vi.fn().mockResolvedValue({
        id: 'asset-row-4',
        asset_id: 'asset_4',
        content_item_id: 'content-row-4',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'newsletter_email',
        provider_family: 'newsletter',
        title: 'Newsletter',
        body_markdown: '# Title',
        body_plaintext: null,
        caption_text: null,
        status: 'approved',
        cta_url: null,
        metadata: {},
        created_by_user_id: 'user-1',
        approved_by_user_id: null,
        approved_at: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      listJobAttempts: vi.fn().mockResolvedValue([]),
      createJobAttempt: vi.fn().mockResolvedValue({}),
    };

    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return {
              maybeSingle: async () => ({
                data: {
                  id: 'content-row-4',
                  content_id: 'content_4',
                  slug: 'newsletter',
                  title: 'Newsletter',
                  status: 'draft',
                  content_type: 'newsletter',
                  target_persona: null,
                  primary_problem: null,
                  topic_cluster: null,
                  keyword_cluster: null,
                  cta_goal: 'free_scan',
                  source_type: 'internal_plus_research',
                  source_links: [],
                  brief_markdown: null,
                  draft_markdown: '# Draft body',
                  canonical_url: null,
                  metadata: {},
                  published_at: null,
                  created_at: '2026-04-02T00:00:00.000Z',
                  updated_at: '2026-04-02T00:00:00.000Z',
                },
                error: null,
              }),
            };
          },
        };
      },
    } as any;

    await expect(
      dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-4', {
        createRepository: () => repo as any,
        resolveAdapter: () =>
          ({
            publishDraft: vi.fn().mockRejectedValue(
              new ContentDestinationPublishError({
                message: 'Kit publish failed (429): rate limited',
                providerName: 'kit',
                statusCode: 429,
                retryable: true,
              })
            ),
          }) as any,
        structuredLog: vi.fn(),
        structuredError: vi.fn(),
      })
    ).rejects.toThrow('Kit publish failed (429): rate limited');

    expect(repo.createJobAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        distributionJobId: 'job-row-4',
        providerStatusCode: 429,
        errorMessage: 'Kit publish failed (429): rate limited',
      })
    );
    expect(repo.updateJob).toHaveBeenLastCalledWith(
      'job-row-4',
      expect.objectContaining({
        status: 'queued',
        lastError: 'Kit publish failed (429): rate limited',
        completedAt: null,
      })
    );
  });
});
