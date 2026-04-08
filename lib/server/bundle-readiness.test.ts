import { describe, expect, it } from 'vitest';
import { buildBundleReadinessSummary } from './bundle-readiness';

describe('buildBundleReadinessSummary', () => {
  it('flags missing billing and mappings as setup work', () => {
    const summary = buildBundleReadinessSummary({
      bundle: {
        bundle_key: 'startup_dev',
        name: 'Startup Dev',
        workspace_type: 'startup',
        status: 'active',
        billing_mode: 'monthly',
        stripe_price_id: null,
        monthly_price_cents: 4900,
        trial_period_days: 7,
      },
      services: [{ id: 'svc-1', service_key: 'github_integration', name: 'GitHub Integration' }],
      bundleServices: [{ service_id: 'svc-1', enabled: true, access_mode: 'paid', usage_limit: null }],
      billingMappings: [],
      overrides: [],
    });

    expect(summary.status).toBe('needs_setup');
    expect(summary.billing.ready).toBe(false);
    expect(summary.mappings.ready).toBe(false);
    expect(summary.issues.some((issue) => issue.area === 'billing')).toBe(true);
  });

  it('marks review when billing and mappings are ready but overrides are not yet defined', () => {
    const summary = buildBundleReadinessSummary({
      bundle: {
        bundle_key: 'agency_core',
        name: 'Agency Core',
        workspace_type: 'agency',
        status: 'active',
        billing_mode: 'monthly',
        stripe_price_id: 'price_123',
        monthly_price_cents: 9900,
        trial_period_days: 7,
      },
      services: [{ id: 'svc-1', service_key: 'deep_audit', name: 'Deep Audit' }],
      bundleServices: [{ service_id: 'svc-1', enabled: true, access_mode: 'paid', usage_limit: null }],
      billingMappings: [
        {
          service_id: 'svc-1',
          is_active: true,
          stripe_product_id: 'prod_123',
          stripe_price_id: 'price_123',
          billing_mode: 'paid',
        },
      ],
      overrides: [],
    });

    expect(summary.billing.ready).toBe(true);
    expect(summary.mappings.ready).toBe(true);
    expect(summary.status).toBe('review');
    expect(summary.entitlements.ready).toBe(false);
  });
});
