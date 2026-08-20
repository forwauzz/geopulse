import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cloudflareMocks = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: cloudflareMocks.getCloudflareContext,
}));

import { getCfWebAnalyticsToken, getPaymentApiEnv, getScanApiEnv } from './cf-env';

describe('Cloudflare build-time environment', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalStaticBuild = mutableEnv['GEOPULSE_STATIC_BUILD'];
  const originalAppUrl = mutableEnv['NEXT_PUBLIC_APP_URL'];
  const originalLegacyPaid = mutableEnv['LEGACY_PAID_ENABLED'];
  const originalBeacon = mutableEnv['NEXT_PUBLIC_CF_BEACON_TOKEN'];

  beforeEach(() => {
    cloudflareMocks.getCloudflareContext.mockReset();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries({
      GEOPULSE_STATIC_BUILD: originalStaticBuild,
      NEXT_PUBLIC_APP_URL: originalAppUrl,
      LEGACY_PAID_ENABLED: originalLegacyPaid,
      NEXT_PUBLIC_CF_BEACON_TOKEN: originalBeacon,
    })) {
      if (value === undefined) delete mutableEnv[key];
      else mutableEnv[key] = value;
    }
  });

  it('uses injected scalar vars without opening runtime bindings during static generation', async () => {
    mutableEnv['GEOPULSE_STATIC_BUILD'] = '1';
    mutableEnv['NEXT_PUBLIC_APP_URL'] = 'https://build.getgeopulse.com/';
    mutableEnv['LEGACY_PAID_ENABLED'] = 'false';
    mutableEnv['NEXT_PUBLIC_CF_BEACON_TOKEN'] = 'public-beacon-token';

    const [scanEnv, paymentEnv, beacon] = await Promise.all([
      getScanApiEnv(),
      getPaymentApiEnv(),
      getCfWebAnalyticsToken(),
    ]);

    expect(scanEnv.NEXT_PUBLIC_APP_URL).toBe('https://build.getgeopulse.com/');
    expect(paymentEnv.LEGACY_PAID_ENABLED).toBe('false');
    expect(paymentEnv.SCAN_QUEUE).toBeUndefined();
    expect(beacon).toBe('public-beacon-token');
    expect(cloudflareMocks.getCloudflareContext).not.toHaveBeenCalled();
  });

  it('continues to use Cloudflare runtime context outside the static build', async () => {
    delete mutableEnv['GEOPULSE_STATIC_BUILD'];
    const repairAgentService = { fetch: vi.fn() };
    cloudflareMocks.getCloudflareContext.mockResolvedValue({
      env: {
        NEXT_PUBLIC_APP_URL: 'https://runtime.getgeopulse.com/',
        LEGACY_PAID_ENABLED: 'true',
        REPAIR_AGENT_SERVICE: repairAgentService,
      },
    });

    const paymentEnv = await getPaymentApiEnv();

    expect(paymentEnv.NEXT_PUBLIC_APP_URL).toBe('https://runtime.getgeopulse.com/');
    expect(paymentEnv.LEGACY_PAID_ENABLED).toBe('true');
    expect(paymentEnv.REPAIR_AGENT_SERVICE).toBe(repairAgentService);
    expect(cloudflareMocks.getCloudflareContext).toHaveBeenCalledWith({ async: true });
  });

  it('recovers the repair service binding from the synchronous Worker context', async () => {
    delete mutableEnv['GEOPULSE_STATIC_BUILD'];
    const repairAgentService = { fetch: vi.fn() };
    cloudflareMocks.getCloudflareContext.mockImplementation(({ async }: { async: boolean }) => async
      ? Promise.resolve({ env: { NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com/' } })
      : { env: { REPAIR_AGENT_SERVICE: repairAgentService } });

    const paymentEnv = await getPaymentApiEnv();

    expect(paymentEnv.REPAIR_AGENT_SERVICE).toBe(repairAgentService);
    expect(cloudflareMocks.getCloudflareContext).toHaveBeenCalledWith({ async: false });
  });
});
