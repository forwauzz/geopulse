import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStartupDashboardData: vi.fn(async () => ({
    selectedWorkspaceId: 'ws_1',
    workspaces: [{ id: 'ws_1', name: 'Workspace', role: 'admin' }],
    scans: [],
    recommendations: [],
    reports: [],
  })),
  getScanApiEnv: vi.fn(async () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service_role_key',
    NEXT_PUBLIC_APP_URL: 'https://example.com',
  })),
  createServiceRoleClient: vi.fn(() => ({}) as any),
  resolveStartupWorkspaceRolloutFlags: vi.fn(async () => ({ startupDashboard: true })),
  resolveStartupWorkspaceBundleKey: vi.fn(async () => 'startup_dev'),
  resolveStartupServiceGate: vi.fn(async (args: any) => ({
    serviceKey: args.serviceKey,
    bundleKey: args.bundleKey,
    entitlement: { enabled: true },
    billing: { allowed: true, reason: null },
    enabled: true,
    blockedReason: null,
  })),
  getStartupGithubIntegrationState: vi.fn(async () => ({ installation: null, repositories: [] })),
  getStartupSlackIntegrationState: vi.fn(async () => ({ installations: [] })),
  listStartupSlackDestinations: vi.fn(async () => []),
  listStartupSlackDeliveryEvents: vi.fn(async () => []),
  readGithubStatusMessage: vi.fn(() => null),
  readSlackStatusMessage: vi.fn(() => null),
}));

vi.mock('@/lib/server/startup-dashboard-data', () => ({
  getStartupDashboardData: mocks.getStartupDashboardData,
}));
vi.mock('@/lib/server/cf-env', () => ({ getScanApiEnv: mocks.getScanApiEnv }));
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: mocks.createServiceRoleClient }));
vi.mock('@/lib/server/startup-rollout-flags', () => ({
  resolveStartupWorkspaceRolloutFlags: mocks.resolveStartupWorkspaceRolloutFlags,
}));
vi.mock('@/lib/server/startup-github-integration', () => ({
  getStartupGithubIntegrationState: mocks.getStartupGithubIntegrationState,
  resolveStartupWorkspaceBundleKey: mocks.resolveStartupWorkspaceBundleKey,
}));
vi.mock('@/lib/server/startup-slack-integration', () => ({
  getStartupSlackIntegrationState: mocks.getStartupSlackIntegrationState,
  listStartupSlackDestinations: mocks.listStartupSlackDestinations,
  listStartupSlackDeliveryEvents: mocks.listStartupSlackDeliveryEvents,
}));
vi.mock('@/lib/server/startup-dashboard-status-messages', () => ({
  readGithubStatusMessage: mocks.readGithubStatusMessage,
  readSlackStatusMessage: mocks.readSlackStatusMessage,
}));
vi.mock('@/lib/server/startup-service-gates', () => ({
  resolveStartupServiceGate: mocks.resolveStartupServiceGate,
}));

import { loadStartupConnectorsContext } from '@/app/dashboard/connectors/lib/load-startup-connectors-context';

describe('loadStartupConnectorsContext', () => {
  beforeEach(() => {
    mocks.resolveStartupServiceGate.mockClear();
    mocks.resolveStartupWorkspaceBundleKey.mockClear();
  });

  it('resolves only github + slack integration gates', async () => {
    const result = await loadStartupConnectorsContext({
      supabase: {} as any,
      userId: 'user_1',
      sp: { startupWorkspace: 'ws_1' },
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    expect(mocks.resolveStartupWorkspaceBundleKey).toHaveBeenCalledTimes(1);
    expect(mocks.resolveStartupServiceGate).toHaveBeenCalledTimes(2);
    expect(mocks.resolveStartupServiceGate).toHaveBeenCalledWith(
      expect.objectContaining({ serviceKey: 'github_integration' })
    );
    expect(mocks.resolveStartupServiceGate).toHaveBeenCalledWith(
      expect.objectContaining({ serviceKey: 'slack_integration' })
    );
  });
});

