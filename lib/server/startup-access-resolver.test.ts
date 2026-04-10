import { describe, expect, it } from 'vitest';
import { resolveStartupAccess } from './startup-access-resolver';

function createSupabaseMock(input: {
  subscription?: Record<string, unknown> | null;
  workspace?: Record<string, unknown> | null;
  membership?: Record<string, unknown> | null;
}) {
  return {
    from(table: string) {
      const makeChain = (row: Record<string, unknown> | null) => ({
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        maybeSingle: async () => ({ data: row, error: null }),
      });

      if (table === 'user_subscriptions') return makeChain(input.subscription ?? null);
      if (table === 'startup_workspaces') return makeChain(input.workspace ?? null);
      if (table === 'startup_workspace_users') return makeChain(input.membership ?? null);

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe('resolveStartupAccess', () => {
  it('returns ready when subscription, workspace, and membership all exist', async () => {
    const result = await resolveStartupAccess({
      supabase: createSupabaseMock({
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
      }) as any,
      userId: 'user_1',
    });

    expect(result.kind).toBe('ready');
    expect(result.canLaunchStartupScan).toBe(true);
    expect(result.needsProvisioning).toBe(false);
    expect(result.selectedWorkspaceId).toBe('ws_1');
    expect(result.subscription?.bundle_key).toBe('startup_dev');
    expect(result.workspace?.name).toBe('Acme');
    expect(result.membership?.role).toBe('founder');
  });

  it('returns needs_provisioning when the live subscription has no workspace link', async () => {
    const result = await resolveStartupAccess({
      supabase: createSupabaseMock({
        subscription: {
          id: 'sub_1',
          bundle_key: 'startup_dev',
          status: 'trialing',
          startup_workspace_id: null,
          created_at: '2026-04-09T00:00:00.000Z',
        },
      }) as any,
      userId: 'user_1',
    });

    expect(result.kind).toBe('needs_provisioning');
    expect(result.canLaunchStartupScan).toBe(false);
    expect(result.needsProvisioning).toBe(true);
    expect(result.selectedWorkspaceId).toBe(null);
    expect(result.subscription?.bundle_key).toBe('startup_dev');
  });

  it('returns workspace_missing_membership when the workspace exists but membership is missing', async () => {
    const result = await resolveStartupAccess({
      supabase: createSupabaseMock({
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
      }) as any,
      userId: 'user_1',
    });

    expect(result.kind).toBe('workspace_missing_membership');
    expect(result.canLaunchStartupScan).toBe(false);
    expect(result.needsProvisioning).toBe(false);
    expect(result.selectedWorkspaceId).toBe('ws_1');
    expect(result.workspace?.workspace_key).toBe('acme');
  });

  it('returns no_subscription when there is no live startup subscription', async () => {
    const result = await resolveStartupAccess({
      supabase: createSupabaseMock({
        subscription: null,
      }) as any,
      userId: 'user_1',
    });

    expect(result.kind).toBe('no_subscription');
    expect(result.canLaunchStartupScan).toBe(false);
    expect(result.needsProvisioning).toBe(false);
    expect(result.selectedWorkspaceId).toBe(null);
    expect(result.subscription).toBe(null);
  });
});
