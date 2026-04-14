import { describe, expect, it } from 'vitest';
import { resolveServiceEntitlement, resolveServiceEntitlements } from './service-entitlements';

type EntitlementRow = {
  service_id: string;
  scope_type: 'global' | 'bundle_default' | 'agency_account' | 'agency_client' | 'user';
  bundle_id?: string;
  agency_account_id?: string;
  agency_client_id?: string;
  user_id?: string;
  enabled: boolean;
  access_mode: 'free' | 'paid' | 'trial' | 'off' | null;
  usage_limit: number | null;
};

function createSupabaseMock(data: {
  services: Array<{ id: string; service_key: string; default_access_mode: 'free' | 'paid' | 'trial' | 'off'; is_active: boolean }>;
  bundles?: Array<{ id: string; bundle_key: string }>;
  bundleServices?: Array<{ bundle_id: string; service_id: string; enabled: boolean; access_mode: 'free' | 'paid' | 'trial' | 'off' | null; usage_limit: number | null }>;
  overrides?: EntitlementRow[];
}) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      return {
        select() {
          return this;
        },
        eq(field: string, value: unknown) {
          filters[field] = value;
          return this;
        },
        maybeSingle() {
          if (table === 'service_catalog') {
            const row = data.services.find((item) => item.service_key === filters['service_key']) ?? null;
            return Promise.resolve({ data: row, error: null });
          }
          if (table === 'service_bundles') {
            const row = (data.bundles ?? []).find((item) => item.bundle_key === filters['bundle_key']) ?? null;
            return Promise.resolve({ data: row, error: null });
          }
          if (table === 'service_bundle_services') {
            const row =
              (data.bundleServices ?? []).find(
                (item) =>
                  item.bundle_id === filters['bundle_id'] && item.service_id === filters['service_id']
              ) ?? null;
            return Promise.resolve({ data: row, error: null });
          }
          if (table === 'service_entitlement_overrides') {
            const row =
              (data.overrides ?? []).find((item) => {
                if (item.service_id !== filters['service_id']) return false;
                if (item.scope_type !== filters['scope_type']) return false;
                if (item.scope_type === 'bundle_default') return item.bundle_id === filters['bundle_id'];
                if (item.scope_type === 'agency_account')
                  return item.agency_account_id === filters['agency_account_id'];
                if (item.scope_type === 'agency_client')
                  return item.agency_client_id === filters['agency_client_id'];
                if (item.scope_type === 'user') return item.user_id === filters['user_id'];
                return true;
              }) ?? null;
            return Promise.resolve({ data: row, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  } as any;
}

describe('service-entitlements resolver', () => {
  it('applies precedence: default -> bundle -> global -> bundle override -> account -> client -> user', async () => {
    const supabase = createSupabaseMock({
      services: [
        {
          id: 'svc-1',
          service_key: 'deep_audit',
          default_access_mode: 'paid',
          is_active: true,
        },
      ],
      bundles: [{ id: 'bundle-1', bundle_key: 'startup_dev' }],
      bundleServices: [
        {
          bundle_id: 'bundle-1',
          service_id: 'svc-1',
          enabled: true,
          access_mode: 'trial',
          usage_limit: 10,
        },
      ],
      overrides: [
        {
          service_id: 'svc-1',
          scope_type: 'global',
          enabled: true,
          access_mode: 'paid',
          usage_limit: 50,
        },
        {
          service_id: 'svc-1',
          scope_type: 'bundle_default',
          bundle_id: 'bundle-1',
          enabled: true,
          access_mode: 'trial',
          usage_limit: 25,
        },
        {
          service_id: 'svc-1',
          scope_type: 'agency_account',
          agency_account_id: 'acct-1',
          enabled: true,
          access_mode: 'trial',
          usage_limit: 20,
        },
        {
          service_id: 'svc-1',
          scope_type: 'agency_client',
          agency_client_id: 'client-1',
          enabled: false,
          access_mode: 'off',
          usage_limit: 0,
        },
        {
          service_id: 'svc-1',
          scope_type: 'user',
          user_id: 'user-1',
          enabled: true,
          access_mode: 'free',
          usage_limit: 1,
        },
      ],
    });

    const resolved = await resolveServiceEntitlement({
      supabase,
      serviceKey: 'deep_audit',
      bundleKey: 'startup_dev',
      agencyAccountId: 'acct-1',
      agencyClientId: 'client-1',
      userId: 'user-1',
    });

    expect(resolved).toEqual({
      serviceKey: 'deep_audit',
      enabled: true,
      accessMode: 'free',
      usageLimit: 1,
      source: 'user_override',
    });
  });

  it('falls back to service defaults when no bundle/override exists', async () => {
    const supabase = createSupabaseMock({
      services: [
        {
          id: 'svc-2',
          service_key: 'skills_library',
          default_access_mode: 'free',
          is_active: true,
        },
      ],
    });

    const resolved = await resolveServiceEntitlement({
      supabase,
      serviceKey: 'skills_library',
    });

    expect(resolved).toEqual({
      serviceKey: 'skills_library',
      enabled: true,
      accessMode: 'free',
      usageLimit: null,
      source: 'service_default',
    });
  });

  it('resolves multiple service keys at once', async () => {
    const supabase = createSupabaseMock({
      services: [
        {
          id: 'svc-a',
          service_key: 'free_scan',
          default_access_mode: 'free',
          is_active: true,
        },
        {
          id: 'svc-b',
          service_key: 'github_integration',
          default_access_mode: 'off',
          is_active: true,
        },
      ],
      overrides: [
        {
          service_id: 'svc-b',
          scope_type: 'global',
          enabled: true,
          access_mode: 'paid',
          usage_limit: null,
        },
      ],
    });

    const result = await resolveServiceEntitlements({
      supabase,
      serviceKeys: ['free_scan', 'github_integration'],
    });

    expect(result['free_scan'].accessMode).toBe('free');
    expect(result['github_integration'].accessMode).toBe('paid');
    expect(result['github_integration'].source).toBe('global_override');
  });
});
