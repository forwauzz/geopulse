import { describe, expect, it } from 'vitest';
import {
  buildAgencyDashboardUiGates,
  resolveAgencyFeatureEntitlements,
  resolveAgencyScanAccess,
  validateAgencyContext,
} from './agency-access';

describe('agency access', () => {
  it('allows active members and reads account-level payment bypass', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'agency_users') {
          let eqCalls = 0;
          return {
            select() {
              return this;
            },
            eq(_field: string, _value: string) {
              eqCalls += 1;
              return this;
            },
            maybeSingle() {
              if (eqCalls < 3) {
                return Promise.resolve({ data: null, error: null });
              }
              return Promise.resolve({ data: { id: 'membership-1' }, error: null });
            },
          };
        }

        if (table === 'agency_clients') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({ data: { id: 'client-1' }, error: null });
            },
          };
        }

        if (table === 'agency_feature_flags') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            is() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({ data: { enabled: false }, error: null });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    await expect(
      validateAgencyContext({
        supabase,
        userId: 'user-1',
        agencyAccountId: 'acct-1',
        agencyClientId: 'client-1',
      })
    ).resolves.toBe(true);

    await expect(
      resolveAgencyScanAccess({
        supabase,
        userId: 'user-1',
        scan: { agencyAccountId: 'acct-1', agencyClientId: 'client-1' },
      })
    ).resolves.toEqual({
      isMember: true,
      paymentRequired: false,
    });
  });

  it('resolves agency entitlements with client override and account defaults', async () => {
    const supabase = {
      from(table: string) {
        if (table !== 'agency_feature_flags') {
          throw new Error(`Unexpected table ${table}`);
        }

        let filters: Record<string, unknown> = {};
        return {
          select() {
            return this;
          },
          eq(field: string, value: unknown) {
            filters[field] = value;
            return this;
          },
          is(field: string, value: unknown) {
            filters[field] = value;
            return this;
          },
          maybeSingle() {
            if (
              filters['agency_client_id'] === 'client-1' &&
              filters['flag_key'] === 'deep_audit_enabled'
            ) {
              return Promise.resolve({ data: { enabled: false }, error: null });
            }
            if (
              filters['agency_client_id'] === null &&
              filters['flag_key'] === 'geo_tracker_enabled'
            ) {
              return Promise.resolve({ data: { enabled: true }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    } as any;

    await expect(
      resolveAgencyFeatureEntitlements({
        supabase,
        agencyAccountId: 'acct-1',
        agencyClientId: 'client-1',
      })
    ).resolves.toEqual({
      agencyDashboardEnabled: true,
      scanLaunchEnabled: true,
      reportHistoryEnabled: true,
      deepAuditEnabled: false,
      geoTrackerEnabled: true,
    });
  });

  it('prefers centralized service entitlements when service catalog tables are available', async () => {
    const supabase = {
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
          is(field: string, value: unknown) {
            filters[field] = value;
            return this;
          },
          maybeSingle() {
            if (table === 'service_catalog') {
              const byKey: Record<string, unknown> = {
                agency_dashboard: {
                  id: 'svc-dashboard',
                  service_key: 'agency_dashboard',
                  default_access_mode: 'off',
                  is_active: true,
                },
                free_scan: {
                  id: 'svc-scan',
                  service_key: 'free_scan',
                  default_access_mode: 'off',
                  is_active: true,
                },
                deep_audit: {
                  id: 'svc-deep',
                  service_key: 'deep_audit',
                  default_access_mode: 'off',
                  is_active: true,
                },
                geo_tracker: {
                  id: 'svc-geo',
                  service_key: 'geo_tracker',
                  default_access_mode: 'off',
                  is_active: true,
                },
              };
              return Promise.resolve({
                data: byKey[String(filters['service_key'])] ?? null,
                error: null,
              });
            }

            if (table === 'service_bundles' || table === 'service_bundle_services') {
              return Promise.resolve({ data: null, error: null });
            }

            if (table === 'service_entitlement_overrides') {
              if (
                filters['service_id'] === 'svc-dashboard' &&
                filters['scope_type'] === 'agency_account' &&
                filters['agency_account_id'] === 'acct-1'
              ) {
                return Promise.resolve({
                  data: { enabled: true, access_mode: 'paid', usage_limit: null },
                  error: null,
                });
              }
              if (
                filters['service_id'] === 'svc-scan' &&
                filters['scope_type'] === 'agency_account' &&
                filters['agency_account_id'] === 'acct-1'
              ) {
                return Promise.resolve({
                  data: { enabled: true, access_mode: 'free', usage_limit: null },
                  error: null,
                });
              }
              if (
                filters['service_id'] === 'svc-deep' &&
                filters['scope_type'] === 'agency_client' &&
                filters['agency_client_id'] === 'client-1'
              ) {
                return Promise.resolve({
                  data: { enabled: false, access_mode: 'off', usage_limit: 0 },
                  error: null,
                });
              }
              if (
                filters['service_id'] === 'svc-geo' &&
                filters['scope_type'] === 'agency_account' &&
                filters['agency_account_id'] === 'acct-1'
              ) {
                return Promise.resolve({
                  data: { enabled: true, access_mode: 'trial', usage_limit: 10 },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            }

            if (table === 'agency_feature_flags') {
              if (filters['flag_key'] === 'report_history_enabled') {
                return Promise.resolve({ data: { enabled: true }, error: null });
              }
              return Promise.resolve({ data: null, error: null });
            }

            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    } as any;

    await expect(
      resolveAgencyFeatureEntitlements({
        supabase,
        agencyAccountId: 'acct-1',
        agencyClientId: 'client-1',
      })
    ).resolves.toEqual({
      agencyDashboardEnabled: true,
      scanLaunchEnabled: true,
      reportHistoryEnabled: true,
      deepAuditEnabled: false,
      geoTrackerEnabled: true,
    });
  });

  it('maps entitlement booleans into centralized agency dashboard ui gates', () => {
    const gates = buildAgencyDashboardUiGates({
      agencyDashboardEnabled: true,
      scanLaunchEnabled: false,
      reportHistoryEnabled: true,
      deepAuditEnabled: false,
      geoTrackerEnabled: true,
    });

    expect(gates).toEqual({
      agencyDashboard: true,
      scanLaunch: false,
      reportHistory: true,
      deepAudit: false,
      geoTracker: true,
    });
  });
});
