import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { linkGuestPurchasesToUser } from './link-guest-purchases';

describe('linkGuestPurchasesToUser', () => {
  it('updates payments, scans, and guest reports for matching email', async () => {
    const paymentUpdates: unknown[] = [];
    const scanUpdates: unknown[] = [];
    const reportUpdates: unknown[] = [];

    const supabase = {
      from(table: string) {
        if (table === 'payments') {
          return {
            select() {
              return {
                eq() {
                  return {
                    is: async () => ({
                      data: [{ id: 'pay-1', scan_id: 'scan-1' }],
                      error: null,
                    }),
                  };
                },
              };
            },
            update(payload: unknown) {
              paymentUpdates.push(payload);
              return {
                eq: () => ({ error: null }),
              };
            },
          };
        }
        if (table === 'scans') {
          return {
            update(payload: unknown) {
              scanUpdates.push(payload);
              return {
                eq: () => ({
                  is: async () => ({ error: null }),
                }),
              };
            },
          };
        }
        if (table === 'reports') {
          return {
            update(payload: unknown) {
              reportUpdates.push(payload);
              return {
                eq: () => ({
                  is: async () => ({ error: null }),
                }),
              };
            },
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    } as unknown as SupabaseClient;

    await linkGuestPurchasesToUser(supabase, 'user-uuid', 'Buyer@Example.com');

    expect(paymentUpdates).toContainEqual({ user_id: 'user-uuid' });
    expect(scanUpdates).toContainEqual({ user_id: 'user-uuid' });
    expect(reportUpdates).toContainEqual({ user_id: 'user-uuid', guest_email: null });
  });

  it('no-ops when list returns empty', async () => {
    const update = vi.fn();
    const supabase = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              is: async () => ({ data: [], error: null }),
            }),
          }),
          update,
        };
      },
    } as unknown as SupabaseClient;

    await linkGuestPurchasesToUser(supabase, 'u1', 'a@b.com');
    expect(update).not.toHaveBeenCalled();
  });
});
