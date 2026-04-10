import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  provisionWorkspaceForSubscription,
  subscriptionProvisioningKey,
} from './provision-workspace-for-subscription';

function createSupabaseMock() {
  const calls: Array<{ table: string; method: string; payload?: unknown; options?: unknown }> = [];

  const supabase = {
    from(table: string) {
      if (table === 'service_bundles') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: { id: 'bundle-1' }, error: null }),
                };
              },
            };
          },
        };
      }

      if (table === 'startup_workspaces') {
        return {
          upsert(payload: unknown, options: unknown) {
            calls.push({ table, method: 'upsert', payload, options });
            return {
              select() {
                return {
                  single: async () => ({ data: { id: 'workspace-1' }, error: null }),
                };
              },
            };
          },
        };
      }

      if (table === 'startup_workspace_users') {
        return {
          upsert(payload: unknown, options: unknown) {
            calls.push({ table, method: 'upsert', payload, options });
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'agency_accounts') {
        return {
          upsert(payload: unknown, options: unknown) {
            calls.push({ table, method: 'upsert', payload, options });
            return {
              select() {
                return {
                  single: async () => ({ data: { id: 'account-1' }, error: null }),
                };
              },
            };
          },
        };
      }

      if (table === 'agency_users') {
        return {
          upsert(payload: unknown, options: unknown) {
            calls.push({ table, method: 'upsert', payload, options });
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'user_subscriptions') {
        return {
          update(payload: unknown) {
            calls.push({ table, method: 'update', payload });
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;

  return { supabase, calls };
}

describe('provision-workspace-for-subscription', () => {
  it('derives stable provisioning keys from the Stripe subscription id', () => {
    expect(subscriptionProvisioningKey('startup', 'sub_01ABC')).toBe('startup-sub-01abc');
    expect(subscriptionProvisioningKey('agency', 'sub_01ABC')).toBe('agency-sub-01abc');
  });

  it('uses a subscription-derived startup workspace key and conflict-aware membership write', async () => {
    const { supabase, calls } = createSupabaseMock();

    const result = await provisionWorkspaceForSubscription(supabase, {
      userId: 'user-1',
      userEmail: 'alice@acme.co.uk',
      bundleKey: 'startup_dev',
      subscriptionId: 'sub_01ABC',
      organizationName: 'Acme Labs',
    });

    expect(result).toEqual({ startupWorkspaceId: 'workspace-1', agencyAccountId: null });
    expect(calls).toContainEqual({
      table: 'startup_workspaces',
      method: 'upsert',
      payload: expect.objectContaining({
        workspace_key: 'startup-sub-01abc',
        name: 'Acme Labs',
        metadata: expect.objectContaining({
          subscription_id: 'sub_01ABC',
          organization_name: 'Acme Labs',
        }),
      }),
      options: { onConflict: 'workspace_key' },
    });
    expect(calls).toContainEqual({
      table: 'startup_workspace_users',
      method: 'upsert',
      payload: expect.objectContaining({
        startup_workspace_id: 'workspace-1',
        user_id: 'user-1',
        role: 'founder',
      }),
      options: { onConflict: 'startup_workspace_id,user_id' },
    });
  });

  it('uses a subscription-derived agency account key and conflict-aware membership write', async () => {
    const { supabase, calls } = createSupabaseMock();

    const result = await provisionWorkspaceForSubscription(supabase, {
      userId: 'user-2',
      userEmail: 'sam@agency.example',
      bundleKey: 'agency_core',
      subscriptionId: 'sub_9XYZ',
      organizationName: 'Northstar Agency',
    });

    expect(result).toEqual({ startupWorkspaceId: null, agencyAccountId: 'account-1' });
    expect(calls).toContainEqual({
      table: 'agency_accounts',
      method: 'upsert',
      payload: expect.objectContaining({
        account_key: 'agency-sub-9xyz',
        name: 'Northstar Agency',
        metadata: expect.objectContaining({
          subscription_id: 'sub_9XYZ',
          organization_name: 'Northstar Agency',
        }),
      }),
      options: { onConflict: 'account_key' },
    });
    expect(calls).toContainEqual({
      table: 'agency_users',
      method: 'upsert',
      payload: expect.objectContaining({
        agency_account_id: 'account-1',
        user_id: 'user-2',
        role: 'owner',
      }),
      options: { onConflict: 'agency_account_id,user_id' },
    });
  });
});
