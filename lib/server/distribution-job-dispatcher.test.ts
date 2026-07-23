import { describe, expect, it, vi } from 'vitest';
import { ContentDestinationPublishError } from './content-destination-adapters';
import { refreshSocialOAuthToken } from './distribution-social-oauth';
import { dispatchDistributionJobById, dispatchDistributionJobs } from './distribution-job-dispatcher';

vi.mock('./distribution-social-oauth', async () => {
  const actual = await vi.importActual<typeof import('./distribution-social-oauth')>(
    './distribution-social-oauth'
  );
  return {
    ...actual,
    refreshSocialOAuthToken: vi.fn(),
  };
});

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
  X_OAUTH_CLIENT_ID: 'x-client-id',
  X_OAUTH_CLIENT_SECRET: 'x-client-secret',
  X_OAUTH_TOKEN_URL: '',
  LINKEDIN_OAUTH_CLIENT_ID: '',
  LINKEDIN_OAUTH_CLIENT_SECRET: '',
  LINKEDIN_OAUTH_TOKEN_URL: '',
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

  it('schedules retryable provider failures with a backoff window', async () => {
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
          scheduled_for: '2026-04-02T00:05:00.000Z',
          status: 'scheduled',
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
        status: 'scheduled',
        scheduledFor: expect.any(String),
        lastError: 'Kit publish failed (429): rate limited',
        completedAt: null,
      })
    );
  });

  it('uses provider-specific backoff windows for X rate-limit failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T00:00:00.000Z'));
    try {
      const repo = {
        getJobById: vi.fn().mockResolvedValue({
          id: 'job-row-4x',
          job_id: 'job_4x',
          distribution_asset_id: 'asset-row-4x',
          distribution_account_id: 'acct-row-4x',
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
            id: 'job-row-4x',
            job_id: 'job_4x',
            distribution_asset_id: 'asset-row-4x',
            distribution_account_id: 'acct-row-4x',
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
            id: 'job-row-4x',
            job_id: 'job_4x',
            distribution_asset_id: 'asset-row-4x',
            distribution_account_id: 'acct-row-4x',
            publish_mode: 'draft',
            scheduled_for: '2026-04-02T00:05:00.000Z',
            status: 'scheduled',
            destination_url: null,
            provider_post_id: null,
            last_error: 'X publish failed (429): rate limited',
            created_by_user_id: 'user-1',
            completed_at: null,
            created_at: '2026-04-02T00:00:00.000Z',
            updated_at: '2026-04-02T00:00:00.000Z',
          }),
        getAccountById: vi.fn().mockResolvedValue({
          id: 'acct-row-4x',
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
          id: 'asset-row-4x',
          asset_id: 'asset_4x',
          content_item_id: 'content-row-4x',
          source_type: 'content_item',
          source_key: null,
          asset_type: 'link_post',
          provider_family: 'x',
          title: 'Social post',
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
        listAccountTokensForAccount: vi.fn().mockResolvedValue([
          {
            id: 'token-row-4x',
            distribution_account_id: 'acct-row-4x',
            token_type: 'oauth',
            access_token_encrypted: 'token',
            refresh_token_encrypted: null,
            expires_at: null,
            scopes: [],
            metadata: {},
            created_at: '2026-04-02T00:00:00.000Z',
            updated_at: '2026-04-02T00:00:00.000Z',
          },
        ]),
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
                    id: 'content-row-4x',
                    content_id: 'content_4x',
                    slug: 'social-post',
                    title: 'Social post',
                    status: 'draft',
                    content_type: 'article',
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
        dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-4x', {
          createRepository: () => repo as any,
          resolveAdapter: () =>
            ({
              publishDraft: vi.fn().mockRejectedValue(
                new ContentDestinationPublishError({
                  message: 'X publish failed (429): rate limited',
                  providerName: 'x',
                  statusCode: 429,
                  retryable: true,
                })
              ),
            }) as any,
          structuredLog: vi.fn(),
          structuredError: vi.fn(),
        })
      ).rejects.toThrow('X publish failed (429): rate limited');

      expect(repo.updateJob).toHaveBeenLastCalledWith(
        'job-row-4x',
        expect.objectContaining({
          status: 'scheduled',
          scheduledFor: '2026-04-02T00:05:00.000Z',
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies account backoff profile/multiplier to retry scheduling', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T00:00:00.000Z'));
    try {
      const repo = {
        getJobById: vi.fn().mockResolvedValue({
          id: 'job-row-4p',
          job_id: 'job_4p',
          distribution_asset_id: 'asset-row-4p',
          distribution_account_id: 'acct-row-4p',
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
            id: 'job-row-4p',
            job_id: 'job_4p',
            distribution_asset_id: 'asset-row-4p',
            distribution_account_id: 'acct-row-4p',
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
            id: 'job-row-4p',
            job_id: 'job_4p',
            distribution_asset_id: 'asset-row-4p',
            distribution_account_id: 'acct-row-4p',
            publish_mode: 'draft',
            scheduled_for: '2026-04-02T00:15:00.000Z',
            status: 'scheduled',
            destination_url: null,
            provider_post_id: null,
            last_error: 'X publish failed (429): rate limited',
            created_by_user_id: 'user-1',
            completed_at: null,
            created_at: '2026-04-02T00:00:00.000Z',
            updated_at: '2026-04-02T00:00:00.000Z',
          }),
        getAccountById: vi.fn().mockResolvedValue({
          id: 'acct-row-4p',
          account_id: 'x_founder',
          provider_name: 'x',
          account_label: 'Founder X',
          external_account_id: null,
          status: 'connected',
          default_audience_id: null,
          metadata: {
            retry_backoff_profile: 'conservative',
            retry_backoff_multiplier: 2,
          },
          connected_by_user_id: 'user-1',
          last_verified_at: null,
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        }),
        getAssetById: vi.fn().mockResolvedValue({
          id: 'asset-row-4p',
          asset_id: 'asset_4p',
          content_item_id: 'content-row-4p',
          source_type: 'content_item',
          source_key: null,
          asset_type: 'link_post',
          provider_family: 'x',
          title: 'Social post',
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
        listAccountTokensForAccount: vi.fn().mockResolvedValue([
          {
            id: 'token-row-4p',
            distribution_account_id: 'acct-row-4p',
            token_type: 'oauth',
            access_token_encrypted: 'token',
            refresh_token_encrypted: null,
            expires_at: null,
            scopes: [],
            metadata: {},
            created_at: '2026-04-02T00:00:00.000Z',
            updated_at: '2026-04-02T00:00:00.000Z',
          },
        ]),
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
                    id: 'content-row-4p',
                    content_id: 'content_4p',
                    slug: 'social-post',
                    title: 'Social post',
                    status: 'draft',
                    content_type: 'article',
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
        dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-4p', {
          createRepository: () => repo as any,
          resolveAdapter: () =>
            ({
              publishDraft: vi.fn().mockRejectedValue(
                new ContentDestinationPublishError({
                  message: 'X publish failed (429): rate limited',
                  providerName: 'x',
                  statusCode: 429,
                  retryable: true,
                })
              ),
            }) as any,
          structuredLog: vi.fn(),
          structuredError: vi.fn(),
        })
      ).rejects.toThrow('X publish failed (429): rate limited');

      expect(repo.updateJob).toHaveBeenLastCalledWith(
        'job-row-4p',
        expect.objectContaining({
          status: 'scheduled',
          scheduledFor: '2026-04-02T00:15:00.000Z',
        })
      );
      expect(repo.createJobAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          responseSummary: expect.objectContaining({
            retry_backoff_profile: 'conservative',
            retry_backoff_multiplier: 2,
          }),
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('hydrates social runtime credentials from stored distribution account tokens', async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-5',
        job_id: 'job_5',
        distribution_asset_id: 'asset-row-5',
        distribution_account_id: 'acct-row-5',
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
          id: 'job-row-5',
          job_id: 'job_5',
          distribution_asset_id: 'asset-row-5',
          distribution_account_id: 'acct-row-5',
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
          id: 'job-row-5',
          job_id: 'job_5',
          distribution_asset_id: 'asset-row-5',
          distribution_account_id: 'acct-row-5',
          publish_mode: 'draft',
          scheduled_for: null,
          status: 'published',
          destination_url: 'https://x.com/i/web/status/123',
          provider_post_id: '123',
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: '2026-04-02T01:00:00.000Z',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T01:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-5',
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
        id: 'asset-row-5',
        asset_id: 'asset_5',
        content_item_id: 'content-row-5',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'link_post',
        provider_family: 'x',
        title: 'Social post',
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
      listAccountTokensForAccount: vi.fn().mockResolvedValue([
        {
          id: 'token-row-1',
          distribution_account_id: 'acct-row-5',
          token_type: 'oauth',
          access_token_encrypted: 'token_from_table',
          refresh_token_encrypted: null,
          expires_at: null,
          scopes: [],
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
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
                  id: 'content-row-5',
                  content_id: 'content_5',
                  slug: 'social-post',
                  title: 'Social post',
                  status: 'draft',
                  content_type: 'article',
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
      providerPublicationId: '123',
      destinationUrl: 'https://x.com/i/web/status/123',
      status: 'published',
      metadata: {},
    });

    const summary = await dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-5', {
      createRepository: () => repo as any,
      resolveAdapter: () => ({ publishDraft }) as any,
      structuredLog: vi.fn(),
      structuredError: vi.fn(),
    });

    expect(summary).toEqual({
      scanned: 1,
      dispatched: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(publishDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          X_ACCESS_TOKEN: 'token_from_table',
        }),
      })
    );
  });

  it('fails social dispatch with a bounded auth/config error when no account token exists', async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-6',
        job_id: 'job_6',
        distribution_asset_id: 'asset-row-6',
        distribution_account_id: 'acct-row-6',
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
          id: 'job-row-6',
          job_id: 'job_6',
          distribution_asset_id: 'asset-row-6',
          distribution_account_id: 'acct-row-6',
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
          id: 'job-row-6',
          job_id: 'job_6',
          distribution_asset_id: 'asset-row-6',
          distribution_account_id: 'acct-row-6',
          publish_mode: 'draft',
          scheduled_for: null,
          status: 'failed',
          destination_url: null,
          provider_post_id: null,
          last_error: 'No distribution account token is configured for provider x.',
          created_by_user_id: 'user-1',
          completed_at: '2026-04-02T01:00:00.000Z',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-6',
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
        id: 'asset-row-6',
        asset_id: 'asset_6',
        content_item_id: 'content-row-6',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'link_post',
        provider_family: 'x',
        title: 'Social post',
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
      listAccountTokensForAccount: vi.fn().mockResolvedValue([]),
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
                  id: 'content-row-6',
                  content_id: 'content_6',
                  slug: 'social-post',
                  title: 'Social post',
                  status: 'draft',
                  content_type: 'article',
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
      dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-6', {
        createRepository: () => repo as any,
        resolveAdapter: vi.fn(),
        structuredLog: vi.fn(),
        structuredError: vi.fn(),
      })
    ).rejects.toThrow('No distribution account token is configured for provider x.');

    expect(repo.updateJob).toHaveBeenLastCalledWith(
      'job-row-6',
      expect.objectContaining({
        status: 'failed',
        lastError: 'No distribution account token is configured for provider x.',
      })
    );
  });

  it('fails media-required assets when no provider-ready media rows exist', async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-media-1',
        job_id: 'job_media_1',
        distribution_asset_id: 'asset-row-media-1',
        distribution_account_id: 'acct-row-media-1',
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
          id: 'job-row-media-1',
          job_id: 'job_media_1',
          distribution_asset_id: 'asset-row-media-1',
          distribution_account_id: 'acct-row-media-1',
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
          id: 'job-row-media-1',
          job_id: 'job_media_1',
          distribution_asset_id: 'asset-row-media-1',
          distribution_account_id: 'acct-row-media-1',
          publish_mode: 'draft',
          scheduled_for: null,
          status: 'failed',
          destination_url: null,
          provider_post_id: null,
          last_error:
            'Media-required asset has no provider-ready media. Save media rows with ready/uploaded status before dispatch.',
          created_by_user_id: 'user-1',
          completed_at: '2026-04-02T01:00:00.000Z',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-media-1',
        account_id: 'linkedin_founder',
        provider_name: 'linkedin',
        account_label: 'Founder LinkedIn',
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
        id: 'asset-row-media-1',
        asset_id: 'asset_media_1',
        content_item_id: 'content-row-media-1',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'carousel_post',
        provider_family: 'linkedin',
        title: 'Carousel post',
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
      listMediaForAsset: vi.fn().mockResolvedValue([
        {
          id: 'media-row-1',
          distribution_asset_id: 'asset-row-media-1',
          media_kind: 'carousel_slide',
          storage_url: 'https://r2.dev/slide-1.png',
          mime_type: 'image/png',
          alt_text: null,
          caption: null,
          sort_order: 0,
          provider_ready_status: 'pending',
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
      listAccountTokensForAccount: vi.fn().mockResolvedValue([
        {
          id: 'token-row-media-1',
          distribution_account_id: 'acct-row-media-1',
          token_type: 'oauth',
          access_token_encrypted: 'token',
          refresh_token_encrypted: null,
          expires_at: null,
          scopes: [],
          metadata: {
            author_urn: 'urn:li:person:123',
          },
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
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
                  id: 'content-row-media-1',
                  content_id: 'content_media_1',
                  slug: 'carousel-post',
                  title: 'Carousel post',
                  status: 'draft',
                  content_type: 'article',
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
      dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-media-1', {
        createRepository: () => repo as any,
        resolveAdapter: vi.fn(),
        structuredLog: vi.fn(),
        structuredError: vi.fn(),
      })
    ).rejects.toThrow(
      'Media-required asset has no provider-ready media. Save media rows with ready/uploaded status before dispatch.'
    );

    expect(repo.updateJob).toHaveBeenLastCalledWith(
      'job-row-media-1',
      expect.objectContaining({
        status: 'failed',
      })
    );
  });

  it('fails media-required assets for provider/type combinations not yet wired', async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-media-2',
        job_id: 'job_media_2',
        distribution_asset_id: 'asset-row-media-2',
        distribution_account_id: 'acct-row-media-2',
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
          id: 'job-row-media-2',
          job_id: 'job_media_2',
          distribution_asset_id: 'asset-row-media-2',
          distribution_account_id: 'acct-row-media-2',
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
          id: 'job-row-media-2',
          job_id: 'job_media_2',
          distribution_asset_id: 'asset-row-media-2',
          distribution_account_id: 'acct-row-media-2',
          publish_mode: 'draft',
          scheduled_for: null,
          status: 'failed',
          destination_url: null,
          provider_post_id: null,
          last_error:
            'Media publish is not yet wired for provider x and asset type carousel_post.',
          created_by_user_id: 'user-1',
          completed_at: '2026-04-02T01:00:00.000Z',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-media-2',
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
        id: 'asset-row-media-2',
        asset_id: 'asset_media_2',
        content_item_id: 'content-row-media-2',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'carousel_post',
        provider_family: 'x',
        title: 'Image post',
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
      listMediaForAsset: vi.fn().mockResolvedValue([
        {
          id: 'media-row-2',
          distribution_asset_id: 'asset-row-media-2',
          media_kind: 'image',
          storage_url: 'https://r2.dev/image.png',
          mime_type: 'image/png',
          alt_text: null,
          caption: null,
          sort_order: 0,
          provider_ready_status: 'ready',
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
      listAccountTokensForAccount: vi.fn().mockResolvedValue([
        {
          id: 'token-row-media-2',
          distribution_account_id: 'acct-row-media-2',
          token_type: 'oauth',
          access_token_encrypted: 'token',
          refresh_token_encrypted: null,
          expires_at: null,
          scopes: [],
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
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
                  id: 'content-row-media-2',
                  content_id: 'content_media_2',
                  slug: 'image-post',
                  title: 'Image post',
                  status: 'draft',
                  content_type: 'article',
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
      dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-media-2', {
        createRepository: () => repo as any,
        resolveAdapter: vi.fn(),
        structuredLog: vi.fn(),
        structuredError: vi.fn(),
      })
    ).rejects.toThrow(
      'Media publish is not yet wired for provider x and asset type carousel_post.'
    );

    expect(repo.updateJob).toHaveBeenLastCalledWith(
      'job-row-media-2',
      expect.objectContaining({
        status: 'failed',
      })
    );
  });

  it('publishes x single-image assets through the media publish path', async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-media-x-1',
        job_id: 'job_media_x_1',
        distribution_asset_id: 'asset-row-media-x-1',
        distribution_account_id: 'acct-row-media-x-1',
        publish_mode: 'publish_now',
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
          id: 'job-row-media-x-1',
          job_id: 'job_media_x_1',
          distribution_asset_id: 'asset-row-media-x-1',
          distribution_account_id: 'acct-row-media-x-1',
          publish_mode: 'publish_now',
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
          id: 'job-row-media-x-1',
          job_id: 'job_media_x_1',
          distribution_asset_id: 'asset-row-media-x-1',
          distribution_account_id: 'acct-row-media-x-1',
          publish_mode: 'publish_now',
          scheduled_for: null,
          status: 'published',
          destination_url: 'https://x.com/i/web/status/123456',
          provider_post_id: '123456',
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: '2026-04-02T01:00:00.000Z',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-media-x-1',
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
        id: 'asset-row-media-x-1',
        asset_id: 'asset_media_x_1',
        content_item_id: 'content-row-media-x-1',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'single_image_post',
        provider_family: 'x',
        title: 'X image post',
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
      listMediaForAsset: vi.fn().mockResolvedValue([
        {
          id: 'media-row-x-1',
          distribution_asset_id: 'asset-row-media-x-1',
          media_kind: 'image',
          storage_url: 'https://r2.dev/x-image.png',
          mime_type: 'image/png',
          alt_text: null,
          caption: null,
          sort_order: 0,
          provider_ready_status: 'ready',
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
      listAccountTokensForAccount: vi.fn().mockResolvedValue([
        {
          id: 'token-row-media-x-1',
          distribution_account_id: 'acct-row-media-x-1',
          token_type: 'oauth',
          access_token_encrypted: 'x_token',
          refresh_token_encrypted: null,
          expires_at: null,
          scopes: [],
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
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
                  id: 'content-row-media-x-1',
                  content_id: 'content_media_x_1',
                  slug: 'x-image-post',
                  title: 'X image post',
                  status: 'draft',
                  content_type: 'article',
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

    const publishXSingleImagePost = vi.fn().mockResolvedValue({
      providerPublicationId: '123456',
      destinationUrl: 'https://x.com/i/web/status/123456',
      status: 'published',
      metadata: { provider: 'x' },
    });

    const summary = await dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-media-x-1', {
      createRepository: () => repo as any,
      resolveAdapter: vi.fn(),
      publishXSingleImagePost,
      structuredLog: vi.fn(),
      structuredError: vi.fn(),
    });

    expect(summary).toEqual({
      scanned: 1,
      dispatched: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(publishXSingleImagePost).toHaveBeenCalledOnce();
    expect(repo.updateJob).toHaveBeenLastCalledWith(
      'job-row-media-x-1',
      expect.objectContaining({
        status: 'published',
        providerPostId: '123456',
      })
    );
  });

  it('publishes x short-video assets through the media publish path', async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-media-x-2',
        job_id: 'job_media_x_2',
        distribution_asset_id: 'asset-row-media-x-2',
        distribution_account_id: 'acct-row-media-x-2',
        publish_mode: 'publish_now',
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
          id: 'job-row-media-x-2',
          job_id: 'job_media_x_2',
          distribution_asset_id: 'asset-row-media-x-2',
          distribution_account_id: 'acct-row-media-x-2',
          publish_mode: 'publish_now',
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
          id: 'job-row-media-x-2',
          job_id: 'job_media_x_2',
          distribution_asset_id: 'asset-row-media-x-2',
          distribution_account_id: 'acct-row-media-x-2',
          publish_mode: 'publish_now',
          scheduled_for: null,
          status: 'published',
          destination_url: 'https://x.com/i/web/status/654321',
          provider_post_id: '654321',
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: '2026-04-02T01:00:00.000Z',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-media-x-2',
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
        id: 'asset-row-media-x-2',
        asset_id: 'asset_media_x_2',
        content_item_id: 'content-row-media-x-2',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'short_video_post',
        provider_family: 'x',
        title: 'X short video post',
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
      listMediaForAsset: vi.fn().mockResolvedValue([
        {
          id: 'media-row-x-2',
          distribution_asset_id: 'asset-row-media-x-2',
          media_kind: 'video',
          storage_url: 'https://r2.dev/x-video.mp4',
          mime_type: 'video/mp4',
          alt_text: null,
          caption: null,
          sort_order: 0,
          provider_ready_status: 'ready',
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
      listAccountTokensForAccount: vi.fn().mockResolvedValue([
        {
          id: 'token-row-media-x-2',
          distribution_account_id: 'acct-row-media-x-2',
          token_type: 'oauth',
          access_token_encrypted: 'x_token',
          refresh_token_encrypted: null,
          expires_at: null,
          scopes: [],
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
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
                  id: 'content-row-media-x-2',
                  content_id: 'content_media_x_2',
                  slug: 'x-video-post',
                  title: 'X short video post',
                  status: 'draft',
                  content_type: 'article',
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

    const publishXShortVideoPost = vi.fn().mockResolvedValue({
      providerPublicationId: '654321',
      destinationUrl: 'https://x.com/i/web/status/654321',
      status: 'published',
      metadata: { provider: 'x' },
    });

    const summary = await dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-media-x-2', {
      createRepository: () => repo as any,
      resolveAdapter: vi.fn(),
      publishXShortVideoPost,
      structuredLog: vi.fn(),
      structuredError: vi.fn(),
    });

    expect(summary).toEqual({
      scanned: 1,
      dispatched: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(publishXShortVideoPost).toHaveBeenCalledOnce();
    expect(repo.updateJob).toHaveBeenLastCalledWith(
      'job-row-media-x-2',
      expect.objectContaining({
        status: 'published',
        providerPostId: '654321',
      })
    );
  });

  it('publishes x long-video assets through the media publish path', async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-media-x-3',
        job_id: 'job_media_x_3',
        distribution_asset_id: 'asset-row-media-x-3',
        distribution_account_id: 'acct-row-media-x-3',
        publish_mode: 'publish_now',
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
          id: 'job-row-media-x-3',
          job_id: 'job_media_x_3',
          distribution_asset_id: 'asset-row-media-x-3',
          distribution_account_id: 'acct-row-media-x-3',
          publish_mode: 'publish_now',
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
          id: 'job-row-media-x-3',
          job_id: 'job_media_x_3',
          distribution_asset_id: 'asset-row-media-x-3',
          distribution_account_id: 'acct-row-media-x-3',
          publish_mode: 'publish_now',
          scheduled_for: null,
          status: 'published',
          destination_url: 'https://x.com/i/web/status/777888',
          provider_post_id: '777888',
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: '2026-04-02T01:00:00.000Z',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-media-x-3',
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
        id: 'asset-row-media-x-3',
        asset_id: 'asset_media_x_3',
        content_item_id: 'content-row-media-x-3',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'long_video_post',
        provider_family: 'x',
        title: 'X long video post',
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
      listMediaForAsset: vi.fn().mockResolvedValue([
        {
          id: 'media-row-x-3',
          distribution_asset_id: 'asset-row-media-x-3',
          media_kind: 'video',
          storage_url: 'https://r2.dev/x-video-long.mp4',
          mime_type: 'video/mp4',
          alt_text: null,
          caption: null,
          sort_order: 0,
          provider_ready_status: 'ready',
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
      listAccountTokensForAccount: vi.fn().mockResolvedValue([
        {
          id: 'token-row-media-x-3',
          distribution_account_id: 'acct-row-media-x-3',
          token_type: 'oauth',
          access_token_encrypted: 'x_token',
          refresh_token_encrypted: null,
          expires_at: null,
          scopes: [],
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
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
                  id: 'content-row-media-x-3',
                  content_id: 'content_media_x_3',
                  slug: 'x-long-video-post',
                  title: 'X long video post',
                  status: 'draft',
                  content_type: 'article',
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

    const publishXLongVideoPost = vi.fn().mockResolvedValue({
      providerPublicationId: '777888',
      destinationUrl: 'https://x.com/i/web/status/777888',
      status: 'published',
      metadata: { provider: 'x' },
    });

    const summary = await dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-media-x-3', {
      createRepository: () => repo as any,
      resolveAdapter: vi.fn(),
      publishXLongVideoPost,
      structuredLog: vi.fn(),
      structuredError: vi.fn(),
    });

    expect(summary).toEqual({
      scanned: 1,
      dispatched: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(publishXLongVideoPost).toHaveBeenCalledOnce();
    expect(repo.updateJob).toHaveBeenLastCalledWith(
      'job-row-media-x-3',
      expect.objectContaining({
        status: 'published',
        providerPostId: '777888',
      })
    );
  });

  it('publishes linkedin single-image assets through the media publish path', async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-media-li-1',
        job_id: 'job_media_li_1',
        distribution_asset_id: 'asset-row-media-li-1',
        distribution_account_id: 'acct-row-media-li-1',
        publish_mode: 'publish_now',
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
          id: 'job-row-media-li-1',
          job_id: 'job_media_li_1',
          distribution_asset_id: 'asset-row-media-li-1',
          distribution_account_id: 'acct-row-media-li-1',
          publish_mode: 'publish_now',
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
          id: 'job-row-media-li-1',
          job_id: 'job_media_li_1',
          distribution_asset_id: 'asset-row-media-li-1',
          distribution_account_id: 'acct-row-media-li-1',
          publish_mode: 'publish_now',
          scheduled_for: null,
          status: 'published',
          destination_url: null,
          provider_post_id: 'urn:li:ugcPost:777',
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: '2026-04-02T01:00:00.000Z',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-media-li-1',
        account_id: 'linkedin_founder',
        provider_name: 'linkedin',
        account_label: 'Founder LinkedIn',
        external_account_id: 'urn:li:person:123',
        status: 'connected',
        default_audience_id: null,
        metadata: {
          author_urn: 'urn:li:person:123',
        },
        connected_by_user_id: 'user-1',
        last_verified_at: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      getAssetById: vi.fn().mockResolvedValue({
        id: 'asset-row-media-li-1',
        asset_id: 'asset_media_li_1',
        content_item_id: 'content-row-media-li-1',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'single_image_post',
        provider_family: 'linkedin',
        title: 'LinkedIn image post',
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
      listMediaForAsset: vi.fn().mockResolvedValue([
        {
          id: 'media-row-li-1',
          distribution_asset_id: 'asset-row-media-li-1',
          media_kind: 'image',
          storage_url: 'https://r2.dev/linkedin-image.png',
          mime_type: 'image/png',
          alt_text: null,
          caption: null,
          sort_order: 0,
          provider_ready_status: 'ready',
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
      listAccountTokensForAccount: vi.fn().mockResolvedValue([
        {
          id: 'token-row-media-li-1',
          distribution_account_id: 'acct-row-media-li-1',
          token_type: 'oauth',
          access_token_encrypted: 'linkedin_token',
          refresh_token_encrypted: null,
          expires_at: null,
          scopes: [],
          metadata: {
            author_urn: 'urn:li:person:123',
          },
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
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
                  id: 'content-row-media-li-1',
                  content_id: 'content_media_li_1',
                  slug: 'linkedin-image-post',
                  title: 'LinkedIn image post',
                  status: 'draft',
                  content_type: 'article',
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

    const publishLinkedInSingleImagePost = vi.fn().mockResolvedValue({
      providerPublicationId: 'urn:li:ugcPost:777',
      destinationUrl: null,
      status: 'published',
      metadata: {
        provider: 'linkedin',
      },
    });

    const summary = await dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-media-li-1', {
      createRepository: () => repo as any,
      resolveAdapter: vi.fn(),
      publishLinkedInSingleImagePost,
      structuredLog: vi.fn(),
      structuredError: vi.fn(),
    });

    expect(summary).toEqual({
      scanned: 1,
      dispatched: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(publishLinkedInSingleImagePost).toHaveBeenCalledOnce();
    expect(repo.updateJob).toHaveBeenLastCalledWith(
      'job-row-media-li-1',
      expect.objectContaining({
        status: 'published',
        providerPostId: 'urn:li:ugcPost:777',
      })
    );
  });

  it('publishes linkedin carousel assets through the media publish path', async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-media-li-2',
        job_id: 'job_media_li_2',
        distribution_asset_id: 'asset-row-media-li-2',
        distribution_account_id: 'acct-row-media-li-2',
        publish_mode: 'publish_now',
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
          id: 'job-row-media-li-2',
          job_id: 'job_media_li_2',
          distribution_asset_id: 'asset-row-media-li-2',
          distribution_account_id: 'acct-row-media-li-2',
          publish_mode: 'publish_now',
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
          id: 'job-row-media-li-2',
          job_id: 'job_media_li_2',
          distribution_asset_id: 'asset-row-media-li-2',
          distribution_account_id: 'acct-row-media-li-2',
          publish_mode: 'publish_now',
          scheduled_for: null,
          status: 'published',
          destination_url: null,
          provider_post_id: 'urn:li:ugcPost:888',
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: '2026-04-02T01:00:00.000Z',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-media-li-2',
        account_id: 'linkedin_founder',
        provider_name: 'linkedin',
        account_label: 'Founder LinkedIn',
        external_account_id: 'urn:li:person:123',
        status: 'connected',
        default_audience_id: null,
        metadata: {
          author_urn: 'urn:li:person:123',
        },
        connected_by_user_id: 'user-1',
        last_verified_at: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      getAssetById: vi.fn().mockResolvedValue({
        id: 'asset-row-media-li-2',
        asset_id: 'asset_media_li_2',
        content_item_id: 'content-row-media-li-2',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'carousel_post',
        provider_family: 'linkedin',
        title: 'LinkedIn carousel post',
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
      listMediaForAsset: vi.fn().mockResolvedValue([
        {
          id: 'media-row-li-2a',
          distribution_asset_id: 'asset-row-media-li-2',
          media_kind: 'carousel_slide',
          storage_url: 'https://r2.dev/linkedin-slide-1.png',
          mime_type: 'image/png',
          alt_text: null,
          caption: null,
          sort_order: 0,
          provider_ready_status: 'ready',
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
        {
          id: 'media-row-li-2b',
          distribution_asset_id: 'asset-row-media-li-2',
          media_kind: 'carousel_slide',
          storage_url: 'https://r2.dev/linkedin-slide-2.png',
          mime_type: 'image/png',
          alt_text: null,
          caption: null,
          sort_order: 1,
          provider_ready_status: 'ready',
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
      listAccountTokensForAccount: vi.fn().mockResolvedValue([
        {
          id: 'token-row-media-li-2',
          distribution_account_id: 'acct-row-media-li-2',
          token_type: 'oauth',
          access_token_encrypted: 'linkedin_token',
          refresh_token_encrypted: null,
          expires_at: null,
          scopes: [],
          metadata: {
            author_urn: 'urn:li:person:123',
          },
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
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
                  id: 'content-row-media-li-2',
                  content_id: 'content_media_li_2',
                  slug: 'linkedin-carousel-post',
                  title: 'LinkedIn carousel post',
                  status: 'draft',
                  content_type: 'article',
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

    const publishLinkedInCarouselPost = vi.fn().mockResolvedValue({
      providerPublicationId: 'urn:li:ugcPost:888',
      destinationUrl: null,
      status: 'published',
      metadata: {
        provider: 'linkedin',
      },
    });

    const summary = await dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-media-li-2', {
      createRepository: () => repo as any,
      resolveAdapter: vi.fn(),
      publishLinkedInCarouselPost,
      structuredLog: vi.fn(),
      structuredError: vi.fn(),
    });

    expect(summary).toEqual({
      scanned: 1,
      dispatched: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(publishLinkedInCarouselPost).toHaveBeenCalledOnce();
    expect(repo.updateJob).toHaveBeenLastCalledWith(
      'job-row-media-li-2',
      expect.objectContaining({
        status: 'published',
        providerPostId: 'urn:li:ugcPost:888',
      })
    );
  });

  it('publishes linkedin short-video assets through the media publish path', async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-media-li-3',
        job_id: 'job_media_li_3',
        distribution_asset_id: 'asset-row-media-li-3',
        distribution_account_id: 'acct-row-media-li-3',
        publish_mode: 'publish_now',
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
          id: 'job-row-media-li-3',
          job_id: 'job_media_li_3',
          distribution_asset_id: 'asset-row-media-li-3',
          distribution_account_id: 'acct-row-media-li-3',
          publish_mode: 'publish_now',
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
          id: 'job-row-media-li-3',
          job_id: 'job_media_li_3',
          distribution_asset_id: 'asset-row-media-li-3',
          distribution_account_id: 'acct-row-media-li-3',
          publish_mode: 'publish_now',
          scheduled_for: null,
          status: 'published',
          destination_url: null,
          provider_post_id: 'urn:li:ugcPost:999',
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: '2026-04-02T01:00:00.000Z',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-media-li-3',
        account_id: 'linkedin_founder',
        provider_name: 'linkedin',
        account_label: 'Founder LinkedIn',
        external_account_id: 'urn:li:person:123',
        status: 'connected',
        default_audience_id: null,
        metadata: {
          author_urn: 'urn:li:person:123',
        },
        connected_by_user_id: 'user-1',
        last_verified_at: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      getAssetById: vi.fn().mockResolvedValue({
        id: 'asset-row-media-li-3',
        asset_id: 'asset_media_li_3',
        content_item_id: 'content-row-media-li-3',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'short_video_post',
        provider_family: 'linkedin',
        title: 'LinkedIn short video post',
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
      listMediaForAsset: vi.fn().mockResolvedValue([
        {
          id: 'media-row-li-3a',
          distribution_asset_id: 'asset-row-media-li-3',
          media_kind: 'video',
          storage_url: 'https://r2.dev/linkedin-video-1.mp4',
          mime_type: 'video/mp4',
          alt_text: null,
          caption: null,
          sort_order: 0,
          provider_ready_status: 'ready',
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
      listAccountTokensForAccount: vi.fn().mockResolvedValue([
        {
          id: 'token-row-media-li-3',
          distribution_account_id: 'acct-row-media-li-3',
          token_type: 'oauth',
          access_token_encrypted: 'linkedin_token',
          refresh_token_encrypted: null,
          expires_at: null,
          scopes: [],
          metadata: {
            author_urn: 'urn:li:person:123',
          },
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
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
                  id: 'content-row-media-li-3',
                  content_id: 'content_media_li_3',
                  slug: 'linkedin-video-post',
                  title: 'LinkedIn short video post',
                  status: 'draft',
                  content_type: 'article',
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

    const publishLinkedInShortVideoPost = vi.fn().mockResolvedValue({
      providerPublicationId: 'urn:li:ugcPost:999',
      destinationUrl: null,
      status: 'published',
      metadata: {
        provider: 'linkedin',
      },
    });

    const summary = await dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-media-li-3', {
      createRepository: () => repo as any,
      resolveAdapter: vi.fn(),
      publishLinkedInShortVideoPost,
      structuredLog: vi.fn(),
      structuredError: vi.fn(),
    });

    expect(summary).toEqual({
      scanned: 1,
      dispatched: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(publishLinkedInShortVideoPost).toHaveBeenCalledOnce();
    expect(repo.updateJob).toHaveBeenLastCalledWith(
      'job-row-media-li-3',
      expect.objectContaining({
        status: 'published',
        providerPostId: 'urn:li:ugcPost:999',
      })
    );
  });

  it('publishes linkedin long-video assets through the media publish path', async () => {
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-media-li-4',
        job_id: 'job_media_li_4',
        distribution_asset_id: 'asset-row-media-li-4',
        distribution_account_id: 'acct-row-media-li-4',
        publish_mode: 'publish_now',
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
          id: 'job-row-media-li-4',
          job_id: 'job_media_li_4',
          distribution_asset_id: 'asset-row-media-li-4',
          distribution_account_id: 'acct-row-media-li-4',
          publish_mode: 'publish_now',
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
          id: 'job-row-media-li-4',
          job_id: 'job_media_li_4',
          distribution_asset_id: 'asset-row-media-li-4',
          distribution_account_id: 'acct-row-media-li-4',
          publish_mode: 'publish_now',
          scheduled_for: null,
          status: 'published',
          destination_url: null,
          provider_post_id: 'urn:li:ugcPost:1001',
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: '2026-04-02T01:00:00.000Z',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-media-li-4',
        account_id: 'linkedin_founder',
        provider_name: 'linkedin',
        account_label: 'Founder LinkedIn',
        external_account_id: 'urn:li:person:123',
        status: 'connected',
        default_audience_id: null,
        metadata: {
          author_urn: 'urn:li:person:123',
        },
        connected_by_user_id: 'user-1',
        last_verified_at: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      getAssetById: vi.fn().mockResolvedValue({
        id: 'asset-row-media-li-4',
        asset_id: 'asset_media_li_4',
        content_item_id: 'content-row-media-li-4',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'long_video_post',
        provider_family: 'linkedin',
        title: 'LinkedIn long video post',
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
      listMediaForAsset: vi.fn().mockResolvedValue([
        {
          id: 'media-row-li-4a',
          distribution_asset_id: 'asset-row-media-li-4',
          media_kind: 'video',
          storage_url: 'https://r2.dev/linkedin-video-long-1.mp4',
          mime_type: 'video/mp4',
          alt_text: null,
          caption: null,
          sort_order: 0,
          provider_ready_status: 'ready',
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
      listAccountTokensForAccount: vi.fn().mockResolvedValue([
        {
          id: 'token-row-media-li-4',
          distribution_account_id: 'acct-row-media-li-4',
          token_type: 'oauth',
          access_token_encrypted: 'linkedin_token',
          refresh_token_encrypted: null,
          expires_at: null,
          scopes: [],
          metadata: {
            author_urn: 'urn:li:person:123',
          },
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
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
                  id: 'content-row-media-li-4',
                  content_id: 'content_media_li_4',
                  slug: 'linkedin-long-video-post',
                  title: 'LinkedIn long video post',
                  status: 'draft',
                  content_type: 'article',
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

    const publishLinkedInLongVideoPost = vi.fn().mockResolvedValue({
      providerPublicationId: 'urn:li:ugcPost:1001',
      destinationUrl: null,
      status: 'published',
      metadata: {
        provider: 'linkedin',
      },
    });

    const summary = await dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-media-li-4', {
      createRepository: () => repo as any,
      resolveAdapter: vi.fn(),
      publishLinkedInLongVideoPost,
      structuredLog: vi.fn(),
      structuredError: vi.fn(),
    });

    expect(summary).toEqual({
      scanned: 1,
      dispatched: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(publishLinkedInLongVideoPost).toHaveBeenCalledOnce();
    expect(repo.updateJob).toHaveBeenLastCalledWith(
      'job-row-media-li-4',
      expect.objectContaining({
        status: 'published',
        providerPostId: 'urn:li:ugcPost:1001',
      })
    );
  });

  it('refreshes an expiring X token before dispatch and uses the refreshed token', async () => {
    vi.mocked(refreshSocialOAuthToken).mockResolvedValue({
      accessToken: 'refreshed_access_token',
      refreshToken: 'refreshed_refresh_token',
      expiresAt: '2026-04-03T12:00:00.000Z',
      scopeList: ['tweet.read', 'tweet.write'],
      raw: { ok: true },
    });

    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-7',
        job_id: 'job_7',
        distribution_asset_id: 'asset-row-7',
        distribution_account_id: 'acct-row-7',
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
          id: 'job-row-7',
          job_id: 'job_7',
          distribution_asset_id: 'asset-row-7',
          distribution_account_id: 'acct-row-7',
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
          id: 'job-row-7',
          job_id: 'job_7',
          distribution_asset_id: 'asset-row-7',
          distribution_account_id: 'acct-row-7',
          publish_mode: 'draft',
          scheduled_for: null,
          status: 'published',
          destination_url: 'https://x.com/i/web/status/777',
          provider_post_id: '777',
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: '2026-04-02T01:00:00.000Z',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T01:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-7',
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
        id: 'asset-row-7',
        asset_id: 'asset_7',
        content_item_id: 'content-row-7',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'link_post',
        provider_family: 'x',
        title: 'Social post',
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
      listAccountTokensForAccount: vi.fn().mockResolvedValue([
        {
          id: 'token-row-7',
          distribution_account_id: 'acct-row-7',
          token_type: 'oauth',
          access_token_encrypted: 'stale_access_token',
          refresh_token_encrypted: 'refresh_token_7',
          expires_at: '2026-01-01T00:00:00.000Z',
          scopes: [],
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
      upsertAccountToken: vi.fn().mockResolvedValue({
        id: 'token-row-7',
        distribution_account_id: 'acct-row-7',
        token_type: 'oauth',
        access_token_encrypted: 'refreshed_access_token',
        refresh_token_encrypted: 'refreshed_refresh_token',
        expires_at: '2026-04-03T12:00:00.000Z',
        scopes: ['tweet.read', 'tweet.write'],
        metadata: { refreshed: true },
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:10:00.000Z',
      }),
      upsertAccount: vi.fn().mockResolvedValue({}),
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
                  id: 'content-row-7',
                  content_id: 'content_7',
                  slug: 'social-post',
                  title: 'Social post',
                  status: 'draft',
                  content_type: 'article',
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
      providerPublicationId: '777',
      destinationUrl: 'https://x.com/i/web/status/777',
      status: 'published',
      metadata: {},
    });

    const summary = await dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-7', {
      createRepository: () => repo as any,
      resolveAdapter: () => ({ publishDraft }) as any,
      structuredLog: vi.fn(),
      structuredError: vi.fn(),
    });

    expect(summary).toEqual({
      scanned: 1,
      dispatched: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(refreshSocialOAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'x',
        refreshToken: 'refresh_token_7',
      })
    );
    expect(publishDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          X_ACCESS_TOKEN: 'refreshed_access_token',
        }),
      })
    );
    expect(repo.upsertAccountToken).toHaveBeenCalledOnce();
  });

  it('refreshes an expiring LinkedIn token before dispatch and uses the refreshed token', async () => {
    vi.mocked(refreshSocialOAuthToken).mockResolvedValue({
      accessToken: 'linkedin_refreshed_access_token',
      refreshToken: 'linkedin_refreshed_refresh_token',
      expiresAt: '2026-04-03T12:00:00.000Z',
      scopeList: ['openid', 'profile', 'w_member_social'],
      raw: { ok: true },
    });

    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-li-1',
        job_id: 'job_li_1',
        distribution_asset_id: 'asset-row-li-1',
        distribution_account_id: 'acct-row-li-1',
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
          id: 'job-row-li-1',
          job_id: 'job_li_1',
          distribution_asset_id: 'asset-row-li-1',
          distribution_account_id: 'acct-row-li-1',
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
          id: 'job-row-li-1',
          job_id: 'job_li_1',
          distribution_asset_id: 'asset-row-li-1',
          distribution_account_id: 'acct-row-li-1',
          publish_mode: 'draft',
          scheduled_for: null,
          status: 'published',
          destination_url: null,
          provider_post_id: 'urn:li:ugcPost:123',
          last_error: null,
          created_by_user_id: 'user-1',
          completed_at: '2026-04-02T01:00:00.000Z',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T01:00:00.000Z',
        }),
      getAccountById: vi.fn().mockResolvedValue({
        id: 'acct-row-li-1',
        account_id: 'linkedin_founder',
        provider_name: 'linkedin',
        account_label: 'Founder LinkedIn',
        external_account_id: 'urn:li:person:123',
        status: 'connected',
        default_audience_id: null,
        metadata: {
          author_urn: 'urn:li:person:123',
        },
        connected_by_user_id: 'user-1',
        last_verified_at: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      getAssetById: vi.fn().mockResolvedValue({
        id: 'asset-row-li-1',
        asset_id: 'asset_li_1',
        content_item_id: 'content-row-li-1',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'link_post',
        provider_family: 'linkedin',
        title: 'LinkedIn post',
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
      listAccountTokensForAccount: vi.fn().mockResolvedValue([
        {
          id: 'token-row-li-1',
          distribution_account_id: 'acct-row-li-1',
          token_type: 'oauth',
          access_token_encrypted: 'linkedin_stale_access_token',
          refresh_token_encrypted: 'linkedin_refresh_token',
          expires_at: '2026-01-01T00:00:00.000Z',
          scopes: [],
          metadata: {},
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ]),
      upsertAccountToken: vi.fn().mockResolvedValue({
        id: 'token-row-li-1',
        distribution_account_id: 'acct-row-li-1',
        token_type: 'oauth',
        access_token_encrypted: 'linkedin_refreshed_access_token',
        refresh_token_encrypted: 'linkedin_refreshed_refresh_token',
        expires_at: '2026-04-03T12:00:00.000Z',
        scopes: ['openid', 'profile', 'w_member_social'],
        metadata: { refreshed: true },
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:10:00.000Z',
      }),
      upsertAccount: vi.fn().mockResolvedValue({}),
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
                  id: 'content-row-li-1',
                  content_id: 'content_li_1',
                  slug: 'linkedin-post',
                  title: 'LinkedIn post',
                  status: 'draft',
                  content_type: 'article',
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
      providerPublicationId: 'urn:li:ugcPost:123',
      destinationUrl: null,
      status: 'published',
      metadata: {},
    });

    const summary = await dispatchDistributionJobById(supabase, baseEnv as any, 'job-row-li-1', {
      createRepository: () => repo as any,
      resolveAdapter: () => ({ publishDraft }) as any,
      structuredLog: vi.fn(),
      structuredError: vi.fn(),
    });

    expect(summary).toEqual({
      scanned: 1,
      dispatched: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(refreshSocialOAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'linkedin',
        refreshToken: 'linkedin_refresh_token',
      })
    );
    expect(publishDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          LINKEDIN_ACCESS_TOKEN: 'linkedin_refreshed_access_token',
        }),
      })
    );
    expect(repo.upsertAccountToken).toHaveBeenCalledOnce();
  });
});
