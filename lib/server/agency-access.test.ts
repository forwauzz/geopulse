import { describe, expect, it } from 'vitest';
import {
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
});
