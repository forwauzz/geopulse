import { describe, expect, it, vi } from 'vitest';

const maybeSingle = vi.fn();
vi.mock('@/lib/server/cf-env', () => ({
  getScanApiEnv: async () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  }),
}));
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  }),
}));

describe('scan monitoring offer', () => {
  it('hides the standalone offer for agency work', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { agency_account_id: 'agency-1', agency_client_id: 'client-1' } });
    const { scanCanShowStandaloneMonitoringOffer } = await import('./scan-monitoring-offer');
    await expect(scanCanShowStandaloneMonitoringOffer('scan-1')).resolves.toBe(false);
  });

  it('allows the offer for an individual scan', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { agency_account_id: null, agency_client_id: null } });
    const { scanCanShowStandaloneMonitoringOffer } = await import('./scan-monitoring-offer');
    await expect(scanCanShowStandaloneMonitoringOffer('scan-2')).resolves.toBe(true);
  });
});
