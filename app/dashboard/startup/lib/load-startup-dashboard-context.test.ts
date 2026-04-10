import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveStartupAccess: vi.fn(async () => ({
    kind: 'ready',
    bundleKey: 'startup_dev',
    subscription: {
      id: 'sub_1',
      bundle_key: 'startup_dev',
      status: 'active',
      startup_workspace_id: 'ws_1',
      created_at: '2026-04-09T00:00:00.000Z',
    },
    workspace: {
      id: 'ws_1',
      workspace_key: 'acme',
      name: 'Acme',
      status: 'active',
    },
    membership: {
      id: 'member_1',
      role: 'founder',
      status: 'active',
    },
    selectedWorkspaceId: 'ws_1',
    canLaunchStartupScan: true,
    needsProvisioning: false,
  })),
}));

vi.mock('@/lib/server/startup-access-resolver', () => ({
  resolveStartupAccess: mocks.resolveStartupAccess,
}));

import { loadStartupDashboardContext } from '@/app/dashboard/startup/lib/load-startup-dashboard-context';

describe('loadStartupDashboardContext', () => {
  beforeEach(() => {
    mocks.resolveStartupAccess.mockClear();
  });

  it('shows a provisioning state when the subscription has no workspace link yet', async () => {
    mocks.resolveStartupAccess.mockResolvedValueOnce({
      kind: 'needs_provisioning',
      bundleKey: 'startup_dev',
      subscription: {
        id: 'sub_1',
        bundle_key: 'startup_dev',
        status: 'active',
        startup_workspace_id: null,
        created_at: '2026-04-09T00:00:00.000Z',
      },
      workspace: null,
      membership: null,
      selectedWorkspaceId: null,
      canLaunchStartupScan: false,
      needsProvisioning: true,
    } as any);

    const result = await loadStartupDashboardContext({
      supabase: {} as any,
      userId: 'user_1',
      sp: {},
    });

    expect(result.kind).toBe('needs-provisioning');
    if (result.kind !== 'needs-provisioning') return;
    expect(result.bundleKey).toBe('startup_dev');
  });

  it('shows a membership repair state when the workspace exists but access is missing', async () => {
    mocks.resolveStartupAccess.mockResolvedValueOnce({
      kind: 'workspace_missing_membership',
      bundleKey: 'startup_dev',
      subscription: {
        id: 'sub_1',
        bundle_key: 'startup_dev',
        status: 'active',
        startup_workspace_id: 'ws_1',
        created_at: '2026-04-09T00:00:00.000Z',
      },
      workspace: {
        id: 'ws_1',
        workspace_key: 'acme',
        name: 'Acme',
        status: 'active',
      },
      membership: null,
      selectedWorkspaceId: 'ws_1',
      canLaunchStartupScan: false,
      needsProvisioning: false,
    } as any);

    const result = await loadStartupDashboardContext({
      supabase: {} as any,
      userId: 'user_1',
      sp: {},
    });

    expect(result.kind).toBe('workspace-missing-membership');
    if (result.kind !== 'workspace-missing-membership') return;
    expect(result.bundleKey).toBe('startup_dev');
    expect(result.workspaceName).toBe('Acme');
  });
});
