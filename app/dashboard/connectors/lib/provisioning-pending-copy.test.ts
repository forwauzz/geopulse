import { describe, expect, it } from 'vitest';
import { buildProvisioningPendingCopy } from './provisioning-pending-copy';

describe('buildProvisioningPendingCopy', () => {
  it('renders a dashboard return path for startup subscriptions', () => {
    const copy = buildProvisioningPendingCopy('startup_dev');

    expect(copy.title).toBe('Your workspace is being prepared');
    expect(copy.body).toContain('startup workspace');
    expect(copy.ctaLabel).toBe('Go to dashboard');
    expect(copy.ctaHref).toBe('/dashboard');
  });

  it('uses agency wording for agency subscriptions', () => {
    const copy = buildProvisioningPendingCopy('agency_pro');

    expect(copy.body).toContain('agency account');
  });
});
