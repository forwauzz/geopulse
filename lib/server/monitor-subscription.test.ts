import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeNextAudit,
  mintPrivateToken,
  monitorPriceIdForPlan,
  normalizeMonitorPlan,
  resolveMonitorPlan,
  seedMonitorSubscription,
  MONITOR_AUDIT_INTERVAL_DAYS,
} from './monitor-subscription';

const ENV = {
  STRIPE_PRICE_ID_MONITOR_MONTHLY: 'price_month',
  STRIPE_PRICE_ID_MONITOR_ANNUAL: 'price_year',
};

/** Minimal chainable Supabase stand-in that records inserts/updates and returns a fixed row. */
function makeSupabase(existing: unknown = null) {
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const api: Record<string, unknown> = {
    from: () => api,
    select: () => api,
    eq: () => api,
    lte: () => api,
    order: () => api,
    limit: () => Promise.resolve({ data: [] }),
    maybeSingle: () => Promise.resolve({ data: existing }),
    insert: (row: Record<string, unknown>) => {
      inserts.push(row);
      return Promise.resolve({ error: null });
    },
    update: (row: Record<string, unknown>) => {
      updates.push(row);
      return { eq: () => Promise.resolve({ error: null }) };
    },
  };
  return { client: api as unknown as SupabaseClient, inserts, updates };
}

describe('monitor-subscription pure helpers', () => {
  it('computeNextAudit advances by the audit interval', () => {
    const from = Date.UTC(2026, 0, 1);
    const next = new Date(computeNextAudit(from)).getTime();
    expect(next - from).toBe(MONITOR_AUDIT_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  });

  it('mintPrivateToken is 64 hex chars, dashless, and unique', () => {
    const a = mintPrivateToken();
    const b = mintPrivateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('-');
    expect(a).not.toBe(b);
  });

  it('resolveMonitorPlan maps price ids to plans and rejects others', () => {
    expect(resolveMonitorPlan('price_month', ENV)).toBe('monthly');
    expect(resolveMonitorPlan('price_year', ENV)).toBe('annual');
    expect(resolveMonitorPlan('price_other', ENV)).toBeNull();
    expect(resolveMonitorPlan(null, ENV)).toBeNull();
  });

  it('monitorPriceIdForPlan / normalizeMonitorPlan round-trip', () => {
    expect(monitorPriceIdForPlan('monthly', ENV)).toBe('price_month');
    expect(monitorPriceIdForPlan('annual', ENV)).toBe('price_year');
    expect(normalizeMonitorPlan('annual')).toBe('annual');
    expect(normalizeMonitorPlan('garbage')).toBe('monthly');
    expect(normalizeMonitorPlan(undefined)).toBe('monthly');
  });
});

describe('seedMonitorSubscription', () => {
  it('inserts a new active row with a token, derived domain, and armed next audit', async () => {
    const { client, inserts } = makeSupabase(null);
    const nowMs = Date.UTC(2026, 5, 1);
    const res = await seedMonitorSubscription(client, {
      email: 'Owner@Example.com',
      monitoredUrl: 'https://www.example.com/',
      plan: 'monthly',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      stripePriceId: 'price_month',
      originScanId: 'scan_1',
      status: 'active',
      nowMs,
    });
    expect(res.ok).toBe(true);
    expect(res.created).toBe(true);
    expect(res.token).toMatch(/^[0-9a-f]{64}$/);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      email: 'owner@example.com', // normalized
      domain: 'example.com', // www stripped
      plan: 'monthly',
      status: 'active',
      stripe_subscription_id: 'sub_1',
    });
    expect(inserts[0]?.['next_audit_at']).toBe(computeNextAudit(nowMs));
  });

  it('rejects an invalid email without inserting', async () => {
    const { client, inserts } = makeSupabase(null);
    const res = await seedMonitorSubscription(client, {
      email: 'not-an-email',
      monitoredUrl: 'https://example.com',
      plan: 'monthly',
      stripeCustomerId: null,
      stripeSubscriptionId: 'sub_x',
      stripePriceId: null,
      originScanId: null,
      status: 'active',
      nowMs: Date.now(),
    });
    expect(res.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it('touches an existing row (no duplicate insert) and returns its token', async () => {
    const { client, inserts, updates } = makeSupabase({
      id: 'row_1',
      private_token: 'existingtoken',
      status: 'incomplete',
      next_audit_at: null,
    });
    const nowMs = Date.UTC(2026, 5, 1);
    const res = await seedMonitorSubscription(client, {
      email: 'owner@example.com',
      monitoredUrl: 'https://example.com',
      plan: 'annual',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      stripePriceId: 'price_year',
      originScanId: null,
      status: 'active',
      nowMs,
    });
    expect(res.ok).toBe(true);
    expect(res.created).toBe(false);
    expect(res.token).toBe('existingtoken');
    expect(inserts).toHaveLength(0);
    // transition incomplete → active arms the first audit
    expect(updates[0]?.['next_audit_at']).toBe(computeNextAudit(nowMs));
    expect(updates[0]).toMatchObject({ status: 'active', plan: 'annual' });
  });
});
