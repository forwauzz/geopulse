import { describe, expect, it } from 'vitest';
import { evaluateContentDestinationHealth } from './content-destination-health';

const baseDestination = {
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
  availability_status: 'not_configured',
  availability_reason: 'Credentials not configured.',
  metadata: {},
  created_at: '2026-03-31T10:00:00.000Z',
  updated_at: '2026-03-31T10:00:00.000Z',
} as const;

const baseEnv = {
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
  GHOST_ADMIN_API_URL: '',
  GHOST_ADMIN_API_KEY: '',
  GHOST_ADMIN_API_VERSION: '',
  NEXT_PUBLIC_APP_URL: '',
  RECONCILE_SECRET: '',
  DEEP_AUDIT_DEFAULT_PAGE_LIMIT: '',
  DEEP_AUDIT_BROWSER_RENDER_MODE: '',
  DEEP_AUDIT_INTERNAL_REWRITE_ENABLED: '',
  DEEP_AUDIT_INTERNAL_REWRITE_MODEL: '',
};

describe('evaluateContentDestinationHealth', () => {
  it('marks Kit unavailable when the API key is missing', () => {
    expect(evaluateContentDestinationHealth(baseDestination, baseEnv)).toEqual({
      availabilityStatus: 'not_configured',
      availabilityReason: 'KIT_API_KEY is missing, so draft pushes cannot be sent to Kit.',
      readyToPush: false,
    });
  });

  it('marks Kit available when the API key exists', () => {
    expect(
      evaluateContentDestinationHealth(baseDestination, {
        ...baseEnv,
        KIT_API_KEY: 'kit_test_key',
      })
    ).toEqual({
      availabilityStatus: 'available',
      availabilityReason: 'Kit adapter is configured and ready for draft pushes.',
      readyToPush: true,
    });
  });

  it('marks Buttondown unavailable when the API key is missing', () => {
    expect(
      evaluateContentDestinationHealth(
        {
          ...baseDestination,
          provider_name: 'buttondown',
          destination_key: 'buttondown_newsletter',
          display_name: 'Buttondown',
          requires_paid_plan: false,
          plan_tier: 'free_or_higher',
        },
        baseEnv
      )
    ).toEqual({
      availabilityStatus: 'not_configured',
      availabilityReason:
        'BUTTONDOWN_API_KEY is missing, so draft pushes cannot be sent to Buttondown.',
      readyToPush: false,
    });
  });

  it('marks Buttondown available when the API key exists', () => {
    expect(
      evaluateContentDestinationHealth(
        {
          ...baseDestination,
          provider_name: 'buttondown',
          destination_key: 'buttondown_newsletter',
          display_name: 'Buttondown',
          requires_paid_plan: false,
          plan_tier: 'free_or_higher',
        },
        {
          ...baseEnv,
          BUTTONDOWN_API_KEY: 'buttondown_test_key',
        }
      )
    ).toEqual({
      availabilityStatus: 'available',
      availabilityReason: 'Buttondown adapter is configured and ready for draft pushes.',
      readyToPush: true,
    });
  });

  it('marks non-implemented providers as api_unavailable', () => {
    expect(
      evaluateContentDestinationHealth(
        {
          ...baseDestination,
          provider_name: 'mailchimp',
        },
        {
          ...baseEnv,
          KIT_API_KEY: 'kit_test_key',
        }
      )
    ).toEqual({
      availabilityStatus: 'api_unavailable',
      availabilityReason: 'No live adapter is implemented yet for mailchimp.',
      readyToPush: false,
    });
  });

  it('marks Ghost unavailable when the admin URL is missing', () => {
    expect(
      evaluateContentDestinationHealth(
        {
          ...baseDestination,
          provider_name: 'ghost',
          destination_key: 'ghost_newsletter',
        },
        {
          ...baseEnv,
          GHOST_ADMIN_API_KEY:
            '0123456789abcdef01234567:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        }
      )
    ).toEqual({
      availabilityStatus: 'not_configured',
      availabilityReason: 'GHOST_ADMIN_API_URL is missing, so draft pushes cannot be sent to Ghost.',
      readyToPush: false,
    });
  });

  it('marks Ghost available when the admin URL and API key exist', () => {
    expect(
      evaluateContentDestinationHealth(
        {
          ...baseDestination,
          provider_name: 'ghost',
          destination_key: 'ghost_newsletter',
        },
        {
          ...baseEnv,
          GHOST_ADMIN_API_URL: 'https://example.ghost.io',
          GHOST_ADMIN_API_KEY:
            '0123456789abcdef01234567:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        }
      )
    ).toEqual({
      availabilityStatus: 'available',
      availabilityReason: 'Ghost adapter is configured and ready for draft pushes.',
      readyToPush: true,
    });
  });
});
