import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  scan: vi.fn(),
  snapshot: vi.fn(),
}));

vi.mock('./agency-client-baseline', () => ({ runAndPersistReadinessScan: mocks.scan }));
vi.mock('./buyer-intelligence-snapshot-assembly', () => ({
  ensureAgencyClientBuyerIntelligenceSnapshot: mocks.snapshot,
}));
vi.mock('./lifecycle-email', () => ({ enqueueLifecycleEmail: mocks.enqueue }));
vi.mock('./structured-log', () => ({ structuredError: vi.fn(), structuredLog: vi.fn() }));

import { runMonthlyBuyerIntelligenceSweep } from './monthly-buyer-intelligence';

describe('blocked monthly buyer-intelligence measurement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scan.mockResolvedValue({ id: 'scan-blocked', score: null });
    mocks.snapshot.mockRejectedValue(new Error('buyer_intelligence_scan_ineligible'));
    mocks.enqueue.mockResolvedValue({ ok: true, id: 'delivery-1', status: 'queued' });
  });

  it('preserves truth, queues one access-blocked notice, and records the retry state', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = {
      from(table: string) {
        let updateValue: Record<string, unknown> | null = null;
        const chain: Record<string, any> = {
          select: () => chain,
          not: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          update: (value: Record<string, unknown>) => {
            updateValue = value;
            updates.push(value);
            return chain;
          },
          maybeSingle: async () => table === 'agency_clients'
            ? { data: { id: 'client-1', canonical_domain: 'alie.app', metadata: {} }, error: null }
            : { data: null, error: null },
          limit: async () => {
            if (table === 'client_benchmark_configs') return {
              data: [{
                id: 'config-1',
                agency_account_id: 'agency-1',
                report_email: 'internal@alie.app',
                metadata: { agency_client_id: 'client-1', baseline_status: 'measured' },
              }],
              error: null,
            };
            if (table === 'agency_users') return {
              data: [{ user_id: 'user-1', role: 'owner' }], error: null,
            };
            return { data: [], error: null };
          },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve({ data: null, error: null, updateValue }).then(resolve);
          },
        };
        return chain;
      },
    };

    const result = await runMonthlyBuyerIntelligenceSweep({
      supabase: supabase as never,
      env: {
        MONTHLY_BUYER_INTELLIGENCE_ENABLED: 'true',
        BREVO_PARTNER_TEST_RECIPIENTS: 'internal@alie.app',
        NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
      },
      reportBucket: {} as never,
      now: new Date('2026-08-13T02:01:51.703Z'),
    });

    expect(result).toEqual({ eligible: 1, attempted: 1, completed: 0, failed: 1 });
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'monthly-intelligence-blocked/client-1/scan-blocked',
      eventType: 'monthly_intelligence_blocked',
      templateKey: 'monthly_intelligence_blocked',
      to: 'internal@alie.app',
      subjectId: 'client-1',
    }));
    expect(updates.at(-1)).toEqual(expect.objectContaining({
      metadata: expect.objectContaining({
        buyer_intelligence_last_error: 'buyer_intelligence_scan_ineligible',
        buyer_intelligence_last_error_class: 'access_blocked',
        buyer_intelligence_last_scan_id: 'scan-blocked',
        buyer_intelligence_delivery_id: 'delivery-1',
        buyer_intelligence_delivery_status: 'queued',
        buyer_intelligence_next_at: '2026-08-14T02:01:51.703Z',
      }),
    }));
  });
});
