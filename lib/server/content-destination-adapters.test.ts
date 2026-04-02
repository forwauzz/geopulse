import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveContentDestinationAdapter } from './content-destination-adapters';

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
});
