import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentDestinationPublishError, resolveContentDestinationAdapter } from './content-destination-adapters';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('resolveContentDestinationAdapter', () => {
  it('publishes a Buttondown draft email and returns normalized delivery data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'btn-email-123',
        absolute_url: null,
        creation_date: '2026-03-31T21:00:00.000Z',
        status: 'draft',
      }),
    } as Response) as typeof fetch;

    const adapter = resolveContentDestinationAdapter({
      id: 'dest-buttondown',
      destination_key: 'buttondown_newsletter',
      destination_type: 'newsletter',
      provider_name: 'buttondown',
      display_name: 'Buttondown',
      enabled: true,
      is_default: false,
      requires_paid_plan: false,
      supports_api_publish: true,
      supports_scheduling: true,
      supports_public_archive: true,
      plan_tier: 'free_or_higher',
      availability_status: 'available',
      availability_reason: null,
      metadata: {},
      created_at: '2026-03-31T10:00:00.000Z',
      updated_at: '2026-03-31T10:00:00.000Z',
    });

    const result = await adapter.publishDraft({
      destination: {
        id: 'dest-buttondown',
        destination_key: 'buttondown_newsletter',
        destination_type: 'newsletter',
        provider_name: 'buttondown',
        display_name: 'Buttondown',
        enabled: true,
        is_default: false,
        requires_paid_plan: false,
        supports_api_publish: true,
        supports_scheduling: true,
        supports_public_archive: true,
        plan_tier: 'free_or_higher',
        availability_status: 'available',
        availability_reason: null,
        metadata: {},
        created_at: '2026-03-31T10:00:00.000Z',
        updated_at: '2026-03-31T10:00:00.000Z',
      },
      env: {
        SCAN_CACHE: undefined,
        NEXT_PUBLIC_SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        DISTRIBUTION_ENGINE_UI_ENABLED: '',
        DISTRIBUTION_ENGINE_WRITE_ENABLED: '',
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
        STRIPE_SECRET_KEY: '',
        STRIPE_WEBHOOK_SECRET: '',
        STRIPE_PRICE_ID_DEEP_AUDIT: '',
        RESEND_API_KEY: '',
        RESEND_FROM_EMAIL: '',
        KIT_API_KEY: '',
        BUTTONDOWN_API_KEY: 'buttondown_test_key',
        GHOST_ADMIN_API_URL: '',
        GHOST_ADMIN_API_KEY: '',
        GHOST_ADMIN_API_VERSION: '',
        NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com/',
        RECONCILE_SECRET: '',
        DEEP_AUDIT_DEFAULT_PAGE_LIMIT: '',
        DEEP_AUDIT_BROWSER_RENDER_MODE: '',
        DEEP_AUDIT_INTERNAL_REWRITE_ENABLED: '',
        DEEP_AUDIT_INTERNAL_REWRITE_MODEL: '',
      },
      item: {
        id: 'item-buttondown-1',
        content_id: 'ai-search-readiness-audit-newsletter',
        slug: 'ai-search-readiness-audit-newsletter',
        title: 'How to Audit Your Site for AI Search Readiness',
        status: 'draft',
        content_type: 'newsletter',
        target_persona: 'SEO consultants',
        primary_problem: 'Teams do not know what to audit first.',
        topic_cluster: 'ai_search_readiness',
        keyword_cluster: null,
        cta_goal: 'free_scan',
        source_type: 'internal_plus_research',
        source_links: [],
        brief_markdown: null,
        draft_markdown: '# Heading\n\nThis is the newsletter body.',
        canonical_url: 'https://getgeopulse.com/blog/ai-search-readiness-audit',
        metadata: {},
        published_at: null,
        created_at: '2026-03-31T10:00:00.000Z',
        updated_at: '2026-03-31T10:00:00.000Z',
        deliveries: [],
      },
    });

    expect(result).toEqual({
      providerPublicationId: 'btn-email-123',
      destinationUrl: null,
      status: 'drafted',
      metadata: {
        provider: 'buttondown',
        creation_date: '2026-03-31T21:00:00.000Z',
        buttondown_status: 'draft',
      },
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0]!;
    expect(url).toBe('https://api.buttondown.com/v1/emails');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Token buttondown_test_key',
    });
  });

  it('publishes a Ghost draft post and returns normalized delivery data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        posts: [
          {
            id: 'ghost-post-123',
            url: null,
            updated_at: '2026-03-31T15:30:00.000Z',
          },
        ],
      }),
    } as Response) as typeof fetch;

    const adapter = resolveContentDestinationAdapter({
      id: 'dest-ghost',
      destination_key: 'ghost_newsletter',
      destination_type: 'newsletter',
      provider_name: 'ghost',
      display_name: 'Ghost',
      enabled: true,
      is_default: false,
      requires_paid_plan: true,
      supports_api_publish: true,
      supports_scheduling: true,
      supports_public_archive: true,
      plan_tier: 'pro_or_self_hosted',
      availability_status: 'available',
      availability_reason: null,
      metadata: {},
      created_at: '2026-03-31T10:00:00.000Z',
      updated_at: '2026-03-31T10:00:00.000Z',
    });

    const result = await adapter.publishDraft({
      destination: {
        id: 'dest-ghost',
        destination_key: 'ghost_newsletter',
        destination_type: 'newsletter',
        provider_name: 'ghost',
        display_name: 'Ghost',
        enabled: true,
        is_default: false,
        requires_paid_plan: true,
        supports_api_publish: true,
        supports_scheduling: true,
        supports_public_archive: true,
        plan_tier: 'pro_or_self_hosted',
        availability_status: 'available',
        availability_reason: null,
        metadata: {},
        created_at: '2026-03-31T10:00:00.000Z',
        updated_at: '2026-03-31T10:00:00.000Z',
      },
      env: {
        SCAN_CACHE: undefined,
        NEXT_PUBLIC_SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        DISTRIBUTION_ENGINE_UI_ENABLED: '',
        DISTRIBUTION_ENGINE_WRITE_ENABLED: '',
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
        STRIPE_SECRET_KEY: '',
        STRIPE_WEBHOOK_SECRET: '',
        STRIPE_PRICE_ID_DEEP_AUDIT: '',
        RESEND_API_KEY: '',
        RESEND_FROM_EMAIL: '',
        KIT_API_KEY: '',
        BUTTONDOWN_API_KEY: '',
        GHOST_ADMIN_API_URL: 'https://example.ghost.io',
        GHOST_ADMIN_API_KEY:
          '0123456789abcdef01234567:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        GHOST_ADMIN_API_VERSION: 'v6.0',
        NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com/',
        RECONCILE_SECRET: '',
        DEEP_AUDIT_DEFAULT_PAGE_LIMIT: '',
        DEEP_AUDIT_BROWSER_RENDER_MODE: '',
        DEEP_AUDIT_INTERNAL_REWRITE_ENABLED: '',
        DEEP_AUDIT_INTERNAL_REWRITE_MODEL: '',
      },
      item: {
        id: 'item-ghost-1',
        content_id: 'crawlable-not-extractable-newsletter',
        slug: 'crawlable-not-extractable-newsletter',
        title: 'Crawlable but Not Extractable',
        status: 'draft',
        content_type: 'newsletter',
        target_persona: 'SEO consultants',
        primary_problem: 'Teams confuse crawlability with extractability.',
        topic_cluster: 'extractability',
        keyword_cluster: null,
        cta_goal: 'free_scan',
        source_type: 'internal_plus_research',
        source_links: [],
        brief_markdown: null,
        draft_markdown: '# Heading\n\nThis is the Ghost newsletter body.',
        canonical_url: null,
        metadata: {},
        published_at: null,
        created_at: '2026-03-31T10:00:00.000Z',
        updated_at: '2026-03-31T10:00:00.000Z',
        deliveries: [],
      },
    });

    expect(result).toEqual({
      providerPublicationId: 'ghost-post-123',
      destinationUrl: null,
      status: 'drafted',
      metadata: {
        provider: 'ghost',
        updated_at: '2026-03-31T15:30:00.000Z',
      },
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0]!;
    expect(url).toBe('https://example.ghost.io/ghost/api/admin/posts/?source=html');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Version': 'v6.0',
    });
    expect(String((init?.headers as Record<string, string>).Authorization)).toMatch(/^Ghost /);
  });

  it('publishes a Kit draft broadcast and returns normalized delivery data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 12345,
        public_url: null,
        created_at: '2026-03-31T15:00:00.000Z',
      }),
    } as Response) as typeof fetch;

    const adapter = resolveContentDestinationAdapter({
      id: 'dest-1',
      destination_key: 'kit_newsletter',
      destination_type: 'newsletter',
      provider_name: 'kit',
      display_name: 'Kit',
      enabled: true,
      is_default: false,
      requires_paid_plan: true,
      supports_api_publish: true,
      supports_scheduling: true,
      supports_public_archive: true,
      plan_tier: 'creator_or_higher',
      availability_status: 'available',
      availability_reason: null,
      metadata: {},
      created_at: '2026-03-31T10:00:00.000Z',
      updated_at: '2026-03-31T10:00:00.000Z',
    });

    const result = await adapter.publishDraft({
      destination: {
        id: 'dest-1',
        destination_key: 'kit_newsletter',
        destination_type: 'newsletter',
        provider_name: 'kit',
        display_name: 'Kit',
        enabled: true,
        is_default: false,
        requires_paid_plan: true,
        supports_api_publish: true,
        supports_scheduling: true,
        supports_public_archive: true,
        plan_tier: 'creator_or_higher',
        availability_status: 'available',
        availability_reason: null,
        metadata: {},
        created_at: '2026-03-31T10:00:00.000Z',
        updated_at: '2026-03-31T10:00:00.000Z',
      },
      env: {
        SCAN_CACHE: undefined,
        NEXT_PUBLIC_SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        DISTRIBUTION_ENGINE_UI_ENABLED: '',
        DISTRIBUTION_ENGINE_WRITE_ENABLED: '',
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
        NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com/',
        RECONCILE_SECRET: '',
        DEEP_AUDIT_DEFAULT_PAGE_LIMIT: '',
        DEEP_AUDIT_BROWSER_RENDER_MODE: '',
        DEEP_AUDIT_INTERNAL_REWRITE_ENABLED: '',
        DEEP_AUDIT_INTERNAL_REWRITE_MODEL: '',
      },
      item: {
        id: 'item-1',
        content_id: 'ai-search-readiness-audit-newsletter',
        slug: 'ai-search-readiness-audit-newsletter',
        title: 'How to Audit Your Site for AI Search Readiness',
        status: 'draft',
        content_type: 'newsletter',
        target_persona: 'SEO consultants',
        primary_problem: 'Teams do not know what to audit first.',
        topic_cluster: 'ai_search_readiness',
        keyword_cluster: null,
        cta_goal: 'free_scan',
        source_type: 'internal_plus_research',
        source_links: [],
        brief_markdown: null,
        draft_markdown: '# Heading\n\nThis is the newsletter body.',
        canonical_url: null,
        metadata: {},
        published_at: null,
        created_at: '2026-03-31T10:00:00.000Z',
        updated_at: '2026-03-31T10:00:00.000Z',
        deliveries: [],
      },
    });

    expect(result).toEqual({
      providerPublicationId: '12345',
      destinationUrl: null,
      status: 'drafted',
      metadata: {
        provider: 'kit',
        created_at: '2026-03-31T15:00:00.000Z',
      },
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0]!;
    expect(url).toBe('https://api.kit.com/v4/broadcasts');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Kit-Api-Key': 'kit_test_key',
    });
  });

  it('publishes an X post and returns normalized delivery data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 'x-post-123',
        },
      }),
    } as Response) as typeof fetch;

    const adapter = resolveContentDestinationAdapter({
      id: 'dest-x',
      destination_key: 'x_social',
      destination_type: 'social',
      provider_name: 'x',
      display_name: 'X',
      enabled: true,
      is_default: false,
      requires_paid_plan: false,
      supports_api_publish: true,
      supports_scheduling: true,
      supports_public_archive: true,
      plan_tier: null,
      availability_status: 'available',
      availability_reason: null,
      metadata: {},
      created_at: '2026-04-02T10:00:00.000Z',
      updated_at: '2026-04-02T10:00:00.000Z',
    });

    const result = await adapter.publishDraft({
      destination: {
        id: 'dest-x',
        destination_key: 'x_social',
        destination_type: 'social',
        provider_name: 'x',
        display_name: 'X',
        enabled: true,
        is_default: false,
        requires_paid_plan: false,
        supports_api_publish: true,
        supports_scheduling: true,
        supports_public_archive: true,
        plan_tier: null,
        availability_status: 'available',
        availability_reason: null,
        metadata: {},
        created_at: '2026-04-02T10:00:00.000Z',
        updated_at: '2026-04-02T10:00:00.000Z',
      },
      env: {
        X_ACCESS_TOKEN: 'x_token',
        X_API_BASE_URL: 'https://api.x.com',
      } as any,
      item: {
        id: 'item-x-1',
        content_id: 'x-post-content',
        slug: 'x-post-content',
        title: 'X Post Title',
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
        draft_markdown: 'This is a draft markdown body.',
        canonical_url: 'https://getgeopulse.com/blog/x-post-content',
        metadata: {},
        published_at: null,
        created_at: '2026-04-02T10:00:00.000Z',
        updated_at: '2026-04-02T10:00:00.000Z',
        deliveries: [],
      },
    });

    expect(result).toEqual({
      providerPublicationId: 'x-post-123',
      destinationUrl: 'https://x.com/i/web/status/x-post-123',
      status: 'published',
      metadata: {
        provider: 'x',
      },
    });
  });

  it('publishes a LinkedIn post and returns normalized delivery data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        'x-restli-id': 'urn:li:share:12345',
      }),
      json: async () => ({}),
    } as Response) as typeof fetch;

    const adapter = resolveContentDestinationAdapter({
      id: 'dest-linkedin',
      destination_key: 'linkedin_social',
      destination_type: 'social',
      provider_name: 'linkedin',
      display_name: 'LinkedIn',
      enabled: true,
      is_default: false,
      requires_paid_plan: false,
      supports_api_publish: true,
      supports_scheduling: true,
      supports_public_archive: true,
      plan_tier: null,
      availability_status: 'available',
      availability_reason: null,
      metadata: {},
      created_at: '2026-04-02T10:00:00.000Z',
      updated_at: '2026-04-02T10:00:00.000Z',
    });

    const result = await adapter.publishDraft({
      destination: {
        id: 'dest-linkedin',
        destination_key: 'linkedin_social',
        destination_type: 'social',
        provider_name: 'linkedin',
        display_name: 'LinkedIn',
        enabled: true,
        is_default: false,
        requires_paid_plan: false,
        supports_api_publish: true,
        supports_scheduling: true,
        supports_public_archive: true,
        plan_tier: null,
        availability_status: 'available',
        availability_reason: null,
        metadata: {},
        created_at: '2026-04-02T10:00:00.000Z',
        updated_at: '2026-04-02T10:00:00.000Z',
      },
      env: {
        LINKEDIN_ACCESS_TOKEN: 'linkedin_token',
        LINKEDIN_AUTHOR_URN: 'urn:li:person:abc123',
        LINKEDIN_API_BASE_URL: 'https://api.linkedin.com',
      } as any,
      item: {
        id: 'item-linkedin-1',
        content_id: 'linkedin-post-content',
        slug: 'linkedin-post-content',
        title: 'LinkedIn Post Title',
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
        draft_markdown: 'This is a LinkedIn draft markdown body.',
        canonical_url: 'https://getgeopulse.com/blog/linkedin-post-content',
        metadata: {},
        published_at: null,
        created_at: '2026-04-02T10:00:00.000Z',
        updated_at: '2026-04-02T10:00:00.000Z',
        deliveries: [],
      },
    });

    expect(result).toEqual({
      providerPublicationId: 'urn:li:share:12345',
      destinationUrl: null,
      status: 'published',
      metadata: {
        provider: 'linkedin',
      },
    });
  });

  it('returns a bounded auth/config error for X when token is missing', async () => {
    const adapter = resolveContentDestinationAdapter({
      id: 'dest-x',
      destination_key: 'x_social',
      destination_type: 'social',
      provider_name: 'x',
      display_name: 'X',
      enabled: true,
      is_default: false,
      requires_paid_plan: false,
      supports_api_publish: true,
      supports_scheduling: true,
      supports_public_archive: true,
      plan_tier: null,
      availability_status: 'available',
      availability_reason: null,
      metadata: {},
      created_at: '2026-04-02T10:00:00.000Z',
      updated_at: '2026-04-02T10:00:00.000Z',
    });

    await expect(
      adapter.publishDraft({
        destination: {
          id: 'dest-x',
          destination_key: 'x_social',
          destination_type: 'social',
          provider_name: 'x',
          display_name: 'X',
          enabled: true,
          is_default: false,
          requires_paid_plan: false,
          supports_api_publish: true,
          supports_scheduling: true,
          supports_public_archive: true,
          plan_tier: null,
          availability_status: 'available',
          availability_reason: null,
          metadata: {},
          created_at: '2026-04-02T10:00:00.000Z',
          updated_at: '2026-04-02T10:00:00.000Z',
        },
        env: {} as any,
        item: {
          id: 'item-x-2',
          content_id: 'x-post-content-2',
          slug: 'x-post-content-2',
          title: 'X Post Title',
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
          draft_markdown: 'This is a draft markdown body.',
          canonical_url: null,
          metadata: {},
          published_at: null,
          created_at: '2026-04-02T10:00:00.000Z',
          updated_at: '2026-04-02T10:00:00.000Z',
          deliveries: [],
        },
      })
    ).rejects.toMatchObject({
      providerName: 'x',
      retryable: false,
      message: 'X_ACCESS_TOKEN is missing.',
    });
  });

  it('marks X 429 failures as retryable', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    } as Response) as typeof fetch;

    const adapter = resolveContentDestinationAdapter({
      id: 'dest-x',
      destination_key: 'x_social',
      destination_type: 'social',
      provider_name: 'x',
      display_name: 'X',
      enabled: true,
      is_default: false,
      requires_paid_plan: false,
      supports_api_publish: true,
      supports_scheduling: true,
      supports_public_archive: true,
      plan_tier: null,
      availability_status: 'available',
      availability_reason: null,
      metadata: {},
      created_at: '2026-04-02T10:00:00.000Z',
      updated_at: '2026-04-02T10:00:00.000Z',
    });

    await expect(
      adapter.publishDraft({
        destination: {} as any,
        env: { X_ACCESS_TOKEN: 'x_token' } as any,
        item: {
          id: 'item-x-3',
          content_id: 'x-post-content-3',
          slug: 'x-post-content-3',
          title: 'X Post Title',
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
          draft_markdown: 'This is a draft markdown body.',
          canonical_url: null,
          metadata: {},
          published_at: null,
          created_at: '2026-04-02T10:00:00.000Z',
          updated_at: '2026-04-02T10:00:00.000Z',
          deliveries: [],
        },
      })
    ).rejects.toMatchObject({
      providerName: 'x',
      statusCode: 429,
      retryable: true,
    });
  });

  it('marks X 401 failures as terminal', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    } as Response) as typeof fetch;

    const adapter = resolveContentDestinationAdapter({
      id: 'dest-x',
      destination_key: 'x_social',
      destination_type: 'social',
      provider_name: 'x',
      display_name: 'X',
      enabled: true,
      is_default: false,
      requires_paid_plan: false,
      supports_api_publish: true,
      supports_scheduling: true,
      supports_public_archive: true,
      plan_tier: null,
      availability_status: 'available',
      availability_reason: null,
      metadata: {},
      created_at: '2026-04-02T10:00:00.000Z',
      updated_at: '2026-04-02T10:00:00.000Z',
    });

    await expect(
      adapter.publishDraft({
        destination: {} as any,
        env: { X_ACCESS_TOKEN: 'x_token' } as any,
        item: {
          id: 'item-x-4',
          content_id: 'x-post-content-4',
          slug: 'x-post-content-4',
          title: 'X Post Title',
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
          draft_markdown: 'This is a draft markdown body.',
          canonical_url: null,
          metadata: {},
          published_at: null,
          created_at: '2026-04-02T10:00:00.000Z',
          updated_at: '2026-04-02T10:00:00.000Z',
          deliveries: [],
        },
      })
    ).rejects.toMatchObject({
      providerName: 'x',
      statusCode: 401,
      retryable: false,
    });
  });

  it('marks LinkedIn throttled 403 failures as retryable', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'throttled by rate limit policy',
    } as Response) as typeof fetch;

    const adapter = resolveContentDestinationAdapter({
      id: 'dest-linkedin',
      destination_key: 'linkedin_social',
      destination_type: 'social',
      provider_name: 'linkedin',
      display_name: 'LinkedIn',
      enabled: true,
      is_default: false,
      requires_paid_plan: false,
      supports_api_publish: true,
      supports_scheduling: true,
      supports_public_archive: true,
      plan_tier: null,
      availability_status: 'available',
      availability_reason: null,
      metadata: {},
      created_at: '2026-04-02T10:00:00.000Z',
      updated_at: '2026-04-02T10:00:00.000Z',
    });

    await expect(
      adapter.publishDraft({
        destination: {} as any,
        env: {
          LINKEDIN_ACCESS_TOKEN: 'linkedin_token',
          LINKEDIN_AUTHOR_URN: 'urn:li:person:abc123',
        } as any,
        item: {
          id: 'item-linkedin-2',
          content_id: 'linkedin-post-content-2',
          slug: 'linkedin-post-content-2',
          title: 'LinkedIn Post Title',
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
          draft_markdown: 'This is a LinkedIn draft markdown body.',
          canonical_url: null,
          metadata: {},
          published_at: null,
          created_at: '2026-04-02T10:00:00.000Z',
          updated_at: '2026-04-02T10:00:00.000Z',
          deliveries: [],
        },
      })
    ).rejects.toMatchObject({
      providerName: 'linkedin',
      statusCode: 403,
      retryable: true,
    });
  });

  it('marks LinkedIn permission 403 failures as terminal', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'member does not have permission',
    } as Response) as typeof fetch;

    const adapter = resolveContentDestinationAdapter({
      id: 'dest-linkedin',
      destination_key: 'linkedin_social',
      destination_type: 'social',
      provider_name: 'linkedin',
      display_name: 'LinkedIn',
      enabled: true,
      is_default: false,
      requires_paid_plan: false,
      supports_api_publish: true,
      supports_scheduling: true,
      supports_public_archive: true,
      plan_tier: null,
      availability_status: 'available',
      availability_reason: null,
      metadata: {},
      created_at: '2026-04-02T10:00:00.000Z',
      updated_at: '2026-04-02T10:00:00.000Z',
    });

    await expect(
      adapter.publishDraft({
        destination: {} as any,
        env: {
          LINKEDIN_ACCESS_TOKEN: 'linkedin_token',
          LINKEDIN_AUTHOR_URN: 'urn:li:person:abc123',
        } as any,
        item: {
          id: 'item-linkedin-3',
          content_id: 'linkedin-post-content-3',
          slug: 'linkedin-post-content-3',
          title: 'LinkedIn Post Title',
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
          draft_markdown: 'This is a LinkedIn draft markdown body.',
          canonical_url: null,
          metadata: {},
          published_at: null,
          created_at: '2026-04-02T10:00:00.000Z',
          updated_at: '2026-04-02T10:00:00.000Z',
          deliveries: [],
        },
      })
    ).rejects.toMatchObject({
      providerName: 'linkedin',
      statusCode: 403,
      retryable: false,
    });
  });
});
