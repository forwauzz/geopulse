import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markMonitorLeadConverted } from './monitor-lead-conversion';
import { emitMarketingEvent } from '@services/marketing-attribution/emit';

vi.mock('@services/marketing-attribution/emit', () => ({
  emitMarketingEvent: vi.fn(async () => undefined),
}));

describe('monitor checkout lead attribution', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deduplicates scan and email matches before marking conversion', async () => {
    const updates: Array<{ values: unknown; ids: string[] }> = [];
    const supabase = {
      from(table: string) {
        expect(table).toBe('leads');
        return {
          select() {
            return {
              eq: async () => ({ data: [{ id: 'lead-1', converted: false }], error: null }),
              ilike: async () => ({
                data: [
                  { id: 'lead-1', converted: false },
                  { id: 'lead-2', converted: false },
                  { id: 'lead-3', converted: true },
                ],
                error: null,
              }),
            };
          },
          update(values: unknown) {
            return {
              in: async (_field: string, ids: string[]) => {
                updates.push({ values, ids });
                return { error: null };
              },
            };
          },
        };
      },
    };

    const count = await markMonitorLeadConverted({
      supabase: supabase as never,
      scanId: '33333333-3333-4333-8333-333333333333',
      email: 'owner@alie.app',
      stripeEventId: 'evt_1',
      stripeSessionId: 'cs_1',
    });

    expect(count).toBe(2);
    expect(updates[0]?.ids).toEqual(['lead-1', 'lead-2']);
    expect(updates[0]?.values).toMatchObject({ converted: true });
    expect(emitMarketingEvent).toHaveBeenCalledWith(
      supabase,
      'payment_completed',
      expect.objectContaining({ lead_id: 'lead-1', scan_id: '33333333-3333-4333-8333-333333333333' })
    );
  });

  it('attributes a paid monitor checkout even when no lead row matches', async () => {
    const supabase = {
      from(table: string) {
        expect(table).toBe('leads');
        return {
          select() {
            return {
              eq: async () => ({ data: [], error: null }),
              ilike: async () => ({ data: [], error: null }),
            };
          },
        };
      },
    };

    const count = await markMonitorLeadConverted({
      supabase: supabase as never,
      scanId: '33333333-3333-4333-8333-333333333333',
      email: 'buyer@example.com',
      stripeEventId: 'evt_monitor_2',
      stripeSessionId: 'cs_monitor_2',
    });

    expect(count).toBe(0);
    expect(emitMarketingEvent).toHaveBeenCalledWith(
      supabase,
      'payment_completed',
      expect.objectContaining({
        lead_id: null,
        idempotency_key: 'stripe:evt_monitor_2:payment_completed',
      })
    );
  });
});
