import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  provisionWorkspaceForSubscription,
  selectExistingAgencyAccount,
  subscriptionProvisioningKey,
} from './provision-workspace-for-subscription';

function createSupabaseMock(options?: { existingAgencyAccounts?: Array<{ id: string; canonical_domain: string | null; created_at: string }> }) {
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
          select() {
            return {
              in() {
                return {
                  in: async () => ({
                    data: options?.existingAgencyAccounts ?? [],
                    error: null,
                  }),
                };
              },
            };
          },
          update(payload: unknown) {
            calls.push({ table, method: 'update', payload });
            return {
              eq() {
                return {
                  select() {
                    return {
                      single: async () => ({ data: { id: options?.existingAgencyAccounts?.[0]?.id }, error: null }),
                    };
                  },
                };
              },
            };
          },
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
          select() {
            return {
              eq() {
                return {
                  eq: async () => ({
                    data: (options?.existingAgencyAccounts ?? []).map((account) => ({
                      agency_account_id: account.id,
                    })),
                    error: null,
                  }),
                };
              },
            };
          },
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

  it('prefers the owner workspace whose canonical domain matches and avoids guessing across workspaces', () => {
    const accounts = [
      { id: 'new-duplicate', canonical_domain: null, created_at: '2026-07-20T00:00:00Z' },
      { id: 'lifter', canonical_domain: 'lifter.ca', created_at: '2026-06-01T00:00:00Z' },
    ];
    expect(selectExistingAgencyAccount(accounts, 'lifter.ca')?.id).toBe('lifter');
    expect(selectExistingAgencyAccount(accounts, null)).toBeNull();
    expect(selectExistingAgencyAccount([accounts[0]!], null)?.id).toBe('new-duplicate');
  });

  it('does not claim a public mailbox domain as an agency canonical domain', async () => {
    const { supabase, calls } = createSupabaseMock();
    await provisionWorkspaceForSubscription(supabase, {
      userId: 'user-gmail',
      userEmail: 'owner@gmail.com',
      bundleKey: 'agency_core',
      subscriptionId: 'sub_gmail',
      organizationName: 'Independent Agency',
    });

    expect(calls).toContainEqual({
      table: 'agency_accounts',
      method: 'upsert',
      payload: expect.objectContaining({
        canonical_domain: null,
        website_domain: null,
      }),
      options: { onConflict: 'account_key' },
    });
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
        canonical_domain: 'agency.example',
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

  it('reuses an existing owner workspace instead of creating a duplicate for a new subscription', async () => {
    const { supabase, calls } = createSupabaseMock({
      existingAgencyAccounts: [
        { id: 'account-lifter', canonical_domain: 'lifter.ca', created_at: '2026-06-01T00:00:00Z' },
      ],
    });

    const result = await provisionWorkspaceForSubscription(supabase, {
      userId: 'user-jack',
      userEmail: 'jack@lifter.ca',
      bundleKey: 'agency_core',
      subscriptionId: 'sub_new',
      organizationName: 'Lifter',
    });

    expect(result).toEqual({ startupWorkspaceId: null, agencyAccountId: 'account-lifter' });
    expect(calls).toContainEqual({
      table: 'agency_accounts',
      method: 'update',
      payload: expect.objectContaining({
        status: 'active',
        billing_mode: 'public_checkout',
      }),
    });
    expect(calls.some((call) => call.table === 'agency_accounts' && call.method === 'upsert')).toBe(false);
  });
});
