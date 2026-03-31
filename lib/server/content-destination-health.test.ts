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
});
