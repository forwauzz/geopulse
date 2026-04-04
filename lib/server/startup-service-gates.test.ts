import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveStartupDashboardUiGates, resolveStartupServiceGate } from './startup-service-gates';

vi.mock('./startup-github-integration', () => ({
  resolveStartupWorkspaceBundleKey: vi.fn(),
}));

vi.mock('./service-entitlements', () => ({
  resolveServiceEntitlement: vi.fn(),
}));

vi.mock('./service-billing-guard', () => ({
  resolveServiceBillingGuard: vi.fn(),
}));

import { resolveStartupWorkspaceBundleKey } from './startup-github-integration';
import { resolveServiceEntitlement } from './service-entitlements';
import { resolveServiceBillingGuard } from './service-billing-guard';

describe('startup service gates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveStartupWorkspaceBundleKey).mockResolvedValue('startup_dev');
  });

  it('returns enabled gate when entitlement and billing guard allow service', async () => {
    vi.mocked(resolveServiceEntitlement).mockResolvedValue({
      serviceKey: 'github_integration',
      enabled: true,
      accessMode: 'paid',
      usageLimit: null,
      source: 'bundle_service',
    });
    vi.mocked(resolveServiceBillingGuard).mockResolvedValue({
      allowed: true,
      reason: 'ok',
      requiresStripePayment: true,
      workspaceBillingMode: 'paid',
      mapping: {
        stripeProductId: 'prod_123',
        stripePriceId: 'price_123',
        billingMode: 'paid',
        isActive: true,
      },
    });

    const gate = await resolveStartupServiceGate({
      memberSupabase: {} as any,
      serviceSupabase: {} as any,
      startupWorkspaceId: 'ws-1',
      userId: 'user-1',
      serviceKey: 'github_integration',
    });

    expect(gate.enabled).toBe(true);
    expect(gate.blockedReason).toBeNull();
    expect(gate.bundleKey).toBe('startup_dev');
  });

  it('returns blocked gate reason when billing guard denies service', async () => {
    vi.mocked(resolveServiceEntitlement).mockResolvedValue({
      serviceKey: 'agent_pr_execution',
      enabled: true,
      accessMode: 'paid',
      usageLimit: null,
      source: 'bundle_service',
    });
    vi.mocked(resolveServiceBillingGuard).mockResolvedValue({
      allowed: false,
      reason: 'workspace_requires_paid_mode',
      requiresStripePayment: true,
      workspaceBillingMode: 'free',
      mapping: null,
    });

    const gate = await resolveStartupServiceGate({
      memberSupabase: {} as any,
      serviceSupabase: {} as any,
      startupWorkspaceId: 'ws-1',
      userId: 'user-1',
      serviceKey: 'agent_pr_execution',
    });

    expect(gate.enabled).toBe(false);
    expect(gate.blockedReason).toBe('workspace_requires_paid_mode');
  });

  it('resolves startup dashboard gates for github and agent pr services', async () => {
    vi.mocked(resolveServiceEntitlement)
      .mockResolvedValueOnce({
        serviceKey: 'github_integration',
        enabled: true,
        accessMode: 'free',
        usageLimit: null,
        source: 'bundle_service',
      })
      .mockResolvedValueOnce({
        serviceKey: 'agent_pr_execution',
        enabled: false,
        accessMode: 'off',
        usageLimit: null,
        source: 'bundle_service',
      });
    vi.mocked(resolveServiceBillingGuard)
      .mockResolvedValueOnce({
        allowed: true,
        reason: 'ok',
        requiresStripePayment: false,
        workspaceBillingMode: 'free',
        mapping: null,
      })
      .mockResolvedValueOnce({
        allowed: false,
        reason: 'service_disabled',
        requiresStripePayment: false,
        workspaceBillingMode: 'free',
        mapping: null,
      });

    const gates = await resolveStartupDashboardUiGates({
      memberSupabase: {} as any,
      serviceSupabase: {} as any,
      startupWorkspaceId: 'ws-1',
      userId: 'user-1',
    });

    expect(gates.githubIntegration.enabled).toBe(true);
    expect(gates.agentPrExecution.enabled).toBe(false);
    expect(gates.agentPrExecution.blockedReason).toBe('service_disabled');
  });
});
