import { describe, expect, it } from 'vitest';
import { normalizeDeepAuditCheckoutMode } from '@/lib/shared/deep-audit-checkout-mode';
import { subscriptionNeedsWorkspaceProvisioning } from './subscription-provisioning-gap';
import {
  buildBillingSubscribeSuccessUrl,
  resolvePostSignupRedirect,
} from './billing-onboarding-flow';

describe('billing onboarding flow', () => {
  it('routes a new signup into bundle resume and onboarding', () => {
    expect(
      resolvePostSignupRedirect({
        nextParam: '/pricing',
        bundleParam: 'startup_dev',
        isNewUser: false,
        organizationName: 'Acme Labs',
      }),
    ).toBe('/pricing?bundle=startup_dev&autosubscribe=1&organization_name=Acme+Labs');

    expect(
      resolvePostSignupRedirect({
        nextParam: null,
        bundleParam: null,
        isNewUser: true,
      }),
    ).toBe('/pricing?onboarding=1');
  });

  it('builds the dashboard success URL and keeps provisioning state explicit', () => {
    expect(
      buildBillingSubscribeSuccessUrl({
        baseUrl: 'https://geo-pulse.example.com/',
        bundleKey: 'agency_core',
      }),
    ).toBe('https://geo-pulse.example.com/dashboard?onboarded=true&bundle=agency_core');

    expect(
      subscriptionNeedsWorkspaceProvisioning({
        bundle_key: 'startup_dev',
        status: 'active',
        startup_workspace_id: null,
        agency_account_id: null,
      }),
    ).toBe(true);

    expect(normalizeDeepAuditCheckoutMode('startup_bypass')).toBe('startup_bypass');
    expect(normalizeDeepAuditCheckoutMode('agency_bypass')).toBe('agency_bypass');
  });
});
