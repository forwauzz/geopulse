import { describe, expect, it } from 'vitest';
import { normalizeDeepAuditCheckoutMode } from '@/lib/shared/deep-audit-checkout-mode';
import { subscriptionNeedsWorkspaceProvisioning } from './subscription-provisioning-gap';
import {
  buildBillingSubscribeSuccessUrl,
  resolvePostSignupRedirect,
} from './billing-onboarding-flow';

describe('resolvePostSignupRedirect', () => {
  it('sends a new unbundled user to the short value-first welcome flow', () => {
    expect(
      resolvePostSignupRedirect({
        nextParam: null,
        bundleParam: null,
        isNewUser: true,
      }),
    ).toBe('/dashboard/welcome');
  });

  it('keeps a selected paid bundle on the self-serve checkout path', () => {
    expect(
      resolvePostSignupRedirect({
        nextParam: '/pricing',
        bundleParam: 'agency_core',
        isNewUser: true,
        organizationName: 'North Star Agency',
      }),
    ).toBe('/pricing?bundle=agency_core&autosubscribe=1&organization_name=North+Star+Agency');
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

  it('does not interrupt an existing user returning to a requested page', () => {
    expect(
      resolvePostSignupRedirect({
        nextParam: '/dashboard/clients',
        bundleParam: null,
        isNewUser: false,
      }),
    ).toBeNull();
  });
});
