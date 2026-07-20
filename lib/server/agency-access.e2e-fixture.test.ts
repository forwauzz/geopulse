import { describe, expect, it } from 'vitest';
import { buildE2ESupabaseServerClient } from '@/lib/supabase/e2e-auth';
import { resolveAgencyFeatureEntitlements } from '@/lib/server/agency-access';

/**
 * The E2E fixture must be able to resolve agency entitlements without throwing.
 *
 * `resolveServiceEntitlement` throws on a missing `service_catalog` row, and
 * `shouldFallbackToLegacyEntitlements` only rescues a missing TABLE (42P01) or the mock's
 * 'Unexpected table' — never a missing row. The E2E query builder resolves unmocked tables to `[]`
 * instead of raising, so the throw escaped and /dashboard/history 500'd for agency users, failing
 * 13 specs at once.
 *
 * That was invisible for months because the browser suite was red for unrelated reasons. This test
 * pins it at unit speed so the fixture cannot silently drift from the catalog again.
 */

const E2E_AGENCY_ACCOUNT_ID = '00000000-0000-4000-8000-000000000201';
const E2E_AGENCY_CLIENT_ID = '00000000-0000-4000-8000-000000000202';
const agencyUser = { id: '00000000-0000-4000-8000-000000000200', email: 'agency@example.com' };

describe('agency entitlements against the E2E fixture', () => {
  it('resolves without throwing on a missing service_catalog row', async () => {
    const supabase = buildE2ESupabaseServerClient(agencyUser);

    await expect(
      resolveAgencyFeatureEntitlements({
        supabase,
        agencyAccountId: E2E_AGENCY_ACCOUNT_ID,
        agencyClientId: null,
      })
    ).resolves.toBeDefined();
  });

  it('enables the agency dashboard, matching production catalog values', async () => {
    const supabase = buildE2ESupabaseServerClient(agencyUser);

    const entitlements = await resolveAgencyFeatureEntitlements({
      supabase,
      agencyAccountId: E2E_AGENCY_ACCOUNT_ID,
      agencyClientId: E2E_AGENCY_CLIENT_ID,
    });

    // enabled = is_active && default_access_mode !== 'off'.
    // Production: agency_dashboard/deep_audit = paid, free_scan = free, geo_tracker = off.
    expect(entitlements.agencyDashboardEnabled).toBe(true);
    expect(entitlements.scanLaunchEnabled).toBe(true);
    expect(entitlements.deepAuditEnabled).toBe(true);
    expect(entitlements.geoTrackerEnabled).toBe(false);
  });
});
