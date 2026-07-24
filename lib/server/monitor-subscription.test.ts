import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeNextAudit,
  computeDeliveryRetry,
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

type RowLike = Record<string, unknown> | null;
type SupabaseConfig = {
  /** Row returned by the top-of-function sub-id lookup and generic maybeSingle. */
  existing?: RowLike;
  /** Error the insert resolves with (e.g. a 23505 unique violation). */
  insertError?: { code?: string } | null;
  /** Row returned by the recovery sub-id lookup (after insert failed). */
  bySubLookup?: RowLike;
  /** Row returned by the recovery email+domain lookup. */
  byEmailDomain?: RowLike;
  /** private_token returned by an update().select(). */
  updateToken?: string;
};

/**
 * Filter-aware chainable Supabase stand-in. Each `.from()` gets isolated filter state, so lookups
 * are distinguished by which columns they filter on (sub-id vs email+domain) — enough to exercise
 * the 23505 recovery branches. Records inserts/updates for assertions.
 */
function makeSupabase(config: SupabaseConfig = {}) {
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  let insertCalled = false;

  function builder() {
    const eqCols = new Set<string>();
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (col: string) => {
        eqCols.add(col);
        return b;
      },
      in: () => b,
      lte: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: () => {
        if (eqCols.has('email')) return Promise.resolve({ data: config.byEmailDomain ?? null });
        if (eqCols.has('stripe_subscription_id')) {
          return Promise.resolve({ data: insertCalled ? config.bySubLookup ?? null : config.existing ?? null });
        }
        return Promise.resolve({ data: config.existing ?? null });
      },
      insert: (row: Record<string, unknown>) => {
        inserts.push(row);
        insertCalled = true;
        return Promise.resolve({ error: config.insertError ?? null });
      },
      update: (row: Record<string, unknown>) => {
        updates.push(row);
        const token =
          config.updateToken ??
          (config.existing && typeof config.existing === 'object'
            ? (config.existing['private_token'] as string | undefined)
            : undefined) ??
          'updatedtoken';
        const afterEq = {
          select: () => ({ maybeSingle: () => Promise.resolve({ data: { private_token: token }, error: null }) }),
          then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
        };
        return { eq: () => afterEq };
      },
    };
    return b;
  }

  const api: Record<string, unknown> = { from: () => builder() };
  return { client: api as unknown as SupabaseClient, inserts, updates };
}

describe('monitor-subscription pure helpers', () => {
  it('computeNextAudit advances by the audit interval', () => {
    const from = Date.UTC(2026, 0, 1);
    const next = new Date(computeNextAudit(from)).getTime();
    expect(next - from).toBe(MONITOR_AUDIT_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  });

  it('retries failed delivery the next day instead of losing a monthly report', () => {
    const from = Date.UTC(2026, 0, 1);
    expect(new Date(computeDeliveryRetry(from)).getTime() - from).toBe(24 * 60 * 60 * 1000);
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
    const { client, inserts } = makeSupabase();
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
    const { client, inserts } = makeSupabase();
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
      existing: {
        id: 'row_1',
        private_token: 'existingtoken',
        status: 'incomplete',
        next_audit_at: null,
      },
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

  it('P1 #2: a 23505 email+domain conflict repoints the active row to the new subscription (never silently drops it)', async () => {
    const { client, inserts, updates } = makeSupabase({
      existing: null, // no row for this sub id at the top → we attempt an insert
      insertError: { code: '23505' }, // active email+domain partial index collision
      byEmailDomain: { id: 'row_existing_active', next_audit_at: computeNextAudit(Date.UTC(2026, 4, 1)) },
      updateToken: 'recoveredtoken',
    });
    const nowMs = Date.UTC(2026, 5, 1);
    const res = await seedMonitorSubscription(client, {
      email: 'owner@example.com',
      monitoredUrl: 'https://www.example.com/',
      plan: 'monthly',
      stripeCustomerId: 'cus_new',
      stripeSubscriptionId: 'sub_new',
      stripePriceId: 'price_month',
      originScanId: null,
      status: 'active',
      nowMs,
    });
    expect(res.ok).toBe(true);
    expect(res.created).toBe(false);
    expect(res.token).toBe('recoveredtoken');
    expect(inserts).toHaveLength(1); // the failed insert
    // the recovery update carries the NEW subscription id onto the existing active row
    expect(updates.at(-1)).toMatchObject({ stripe_subscription_id: 'sub_new', plan: 'monthly', status: 'active' });
  });

  it('P1 #2: a 23505 that cannot be resolved returns ok:false (webhook surfaces it, no silent 200)', async () => {
    const { client } = makeSupabase({
      existing: null,
      insertError: { code: '23505' },
      bySubLookup: null,
      byEmailDomain: null,
    });
    const res = await seedMonitorSubscription(client, {
      email: 'owner@example.com',
      monitoredUrl: 'https://www.example.com/',
      plan: 'monthly',
      stripeCustomerId: 'cus_x',
      stripeSubscriptionId: 'sub_x',
      stripePriceId: 'price_month',
      originScanId: null,
      status: 'active',
      nowMs: Date.UTC(2026, 5, 1),
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('seed_conflict_unresolved');
  });
});
