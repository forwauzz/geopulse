import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveStartupDashboardUiGates,
  resolveStartupServiceGate,
  resolveStartupSlackConnectorUiGates,
  resolveStartupSlackIntegrationGate,
} from './startup-service-gates';

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
    expect(resolveStartupWorkspaceBundleKey).toHaveBeenCalledTimes(1);
  });

  it('skips bundle lookup when bundleKey is provided', async () => {
    vi.mocked(resolveServiceEntitlement).mockResolvedValue({
      serviceKey: 'markdown_audit_export',
      enabled: true,
      accessMode: 'free',
      usageLimit: null,
      source: 'bundle_service',
    });
    vi.mocked(resolveServiceBillingGuard).mockResolvedValue({
      allowed: true,
      reason: 'ok',
      requiresStripePayment: false,
      workspaceBillingMode: 'free',
      mapping: null,
    });

    const gate = await resolveStartupServiceGate({
      memberSupabase: {} as any,
      serviceSupabase: {} as any,
      startupWorkspaceId: 'ws-1',
      userId: 'user-1',
      serviceKey: 'markdown_audit_export',
      bundleKey: 'startup_lite',
    });

    expect(gate.bundleKey).toBe('startup_lite');
    expect(resolveStartupWorkspaceBundleKey).not.toHaveBeenCalled();
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

  it('resolves startup dashboard gates for github, pr, and slack services', async () => {
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
      })
      .mockResolvedValueOnce({
        serviceKey: 'slack_integration',
        enabled: true,
        accessMode: 'free',
        usageLimit: null,
        source: 'bundle_service',
      })
      .mockResolvedValueOnce({
        serviceKey: 'slack_notifications',
        enabled: true,
        accessMode: 'free',
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
      })
      .mockResolvedValueOnce({
        allowed: false,
        reason: 'workspace_requires_paid_mode',
        requiresStripePayment: false,
        workspaceBillingMode: 'free',
        mapping: null,
      })
      .mockResolvedValueOnce({
        allowed: true,
        reason: 'ok',
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

    expect(resolveStartupWorkspaceBundleKey).toHaveBeenCalledTimes(1);

    expect(gates.githubIntegration.enabled).toBe(true);
    expect(gates.agentPrExecution.enabled).toBe(false);
    expect(gates.agentPrExecution.blockedReason).toBe('service_disabled');
    expect(gates.slackIntegration.enabled).toBe(false);
    expect(gates.slackIntegration.blockedReason).toBe('workspace_requires_paid_mode');
    expect(gates.slackNotifications.enabled).toBe(true);
  });

  it('resolveStartupSlackIntegrationGate loads bundle once and one service gate', async () => {
    vi.mocked(resolveServiceEntitlement).mockResolvedValue({
      serviceKey: 'slack_integration',
      enabled: true,
      accessMode: 'free',
      usageLimit: null,
      source: 'bundle_service',
    });
    vi.mocked(resolveServiceBillingGuard).mockResolvedValue({
      allowed: true,
      reason: 'ok',
      requiresStripePayment: false,
      workspaceBillingMode: 'free',
      mapping: null,
    });

    const gate = await resolveStartupSlackIntegrationGate({
      memberSupabase: {} as any,
      serviceSupabase: {} as any,
      startupWorkspaceId: 'ws-1',
      userId: 'user-1',
    });

    expect(gate.serviceKey).toBe('slack_integration');
    expect(resolveStartupWorkspaceBundleKey).toHaveBeenCalledTimes(1);
    expect(resolveServiceEntitlement).toHaveBeenCalledTimes(1);
    expect(resolveServiceBillingGuard).toHaveBeenCalledTimes(1);
  });

  it('resolveStartupSlackConnectorUiGates loads bundle once and two slack gates', async () => {
    vi.mocked(resolveServiceEntitlement)
      .mockResolvedValueOnce({
        serviceKey: 'slack_integration',
        enabled: true,
        accessMode: 'free',
        usageLimit: null,
        source: 'bundle_service',
      })
      .mockResolvedValueOnce({
        serviceKey: 'slack_notifications',
        enabled: true,
        accessMode: 'free',
        usageLimit: null,
        source: 'bundle_service',
      });
    vi.mocked(resolveServiceBillingGuard).mockResolvedValue({
      allowed: true,
      reason: 'ok',
      requiresStripePayment: false,
      workspaceBillingMode: 'free',
      mapping: null,
    });

    const gates = await resolveStartupSlackConnectorUiGates({
      memberSupabase: {} as any,
      serviceSupabase: {} as any,
      startupWorkspaceId: 'ws-1',
      userId: 'user-1',
    });

    expect(resolveStartupWorkspaceBundleKey).toHaveBeenCalledTimes(1);
    expect(resolveServiceEntitlement).toHaveBeenCalledTimes(2);
    expect(resolveServiceBillingGuard).toHaveBeenCalledTimes(2);
    expect(gates.slackIntegration.enabled).toBe(true);
    expect(gates.slackNotifications.enabled).toBe(true);
  });
});
