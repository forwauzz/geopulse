import { describe, expect, it } from 'vitest';
import {
  bundleNeedsWorkspaceProvisioning,
  subscriptionNeedsWorkspaceProvisioning,
} from './subscription-provisioning-gap';

describe('subscription-provisioning-gap', () => {
  it('bundleNeedsWorkspaceProvisioning', () => {
    expect(bundleNeedsWorkspaceProvisioning('startup_dev')).toBe(true);
    expect(bundleNeedsWorkspaceProvisioning('agency_core')).toBe(true);
    expect(bundleNeedsWorkspaceProvisioning('agency_pro')).toBe(true);
    expect(bundleNeedsWorkspaceProvisioning('startup_lite')).toBe(false);
  });

  it('subscriptionNeedsWorkspaceProvisioning is true for live paid bundle without workspace', () => {
    expect(
      subscriptionNeedsWorkspaceProvisioning({
        bundle_key: 'startup_dev',
        status: 'active',
        startup_workspace_id: null,
        agency_account_id: null,
      }),
    ).toBe(true);
  });

  it('subscriptionNeedsWorkspaceProvisioning is false when workspace linked', () => {
    expect(
      subscriptionNeedsWorkspaceProvisioning({
        bundle_key: 'startup_dev',
        status: 'active',
        startup_workspace_id: 'ws-1',
        agency_account_id: null,
      }),
    ).toBe(false);
  });

  it('subscriptionNeedsWorkspaceProvisioning is false for cancelled', () => {
    expect(
      subscriptionNeedsWorkspaceProvisioning({
        bundle_key: 'startup_dev',
        status: 'cancelled',
        startup_workspace_id: null,
        agency_account_id: null,
      }),
    ).toBe(false);
  });
});
