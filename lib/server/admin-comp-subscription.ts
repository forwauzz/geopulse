import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanType } from '@/lib/server/plan-type';

/** Placeholder price id for admin-comp rows (not a Stripe price). */
export const ADMIN_COMP_STRIPE_PRICE_ID = 'admin_comp';

/** Deterministic synthetic subscription id — never collides with Stripe `sub_*`. */
export function adminCompStripeSubscriptionId(userId: string): string {
  return `admin_comp:${userId}`;
}

export function isAdminCompStripeSubscriptionId(id: string): boolean {
  return id.startsWith('admin_comp:');
}

/**
 * Bundle for synthetic admin-comp row: inverse of coarse `bundleToPlan` in
 * `subscription-handlers.ts` (pro → startup_dev; agency → agency_core).
 */
export function bundleKeyForAdminPlan(plan: Exclude<PlanType, 'free'>): 'startup_dev' | 'agency_core' {
  return plan === 'pro' ? 'startup_dev' : 'agency_core';
}

/**
 * Keeps `user_subscriptions` aligned when an admin sets `users.plan` without Stripe.
 * Skips creating/updating the synthetic row if a real Stripe subscription already
 * covers the target bundle (partial unique index on active user+bundle).
 */
export async function syncAdminCompSubscription(
  adminDb: SupabaseClient,
  userId: string,
  plan: PlanType,
  stripeCustomerId: string | null | undefined,
): Promise<void> {
  const synthId = adminCompStripeSubscriptionId(userId);

  if (plan === 'free') {
    const { error } = await adminDb
      .from('user_subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', synthId)
      .in('status', ['active', 'trialing']);
    if (error) throw new Error(`Failed to sync admin-comp subscription: ${error.message}`);
    return;
  }

  const bundleKey = bundleKeyForAdminPlan(plan);

  const { data: coverRows } = await adminDb
    .from('user_subscriptions')
    .select('stripe_subscription_id')
    .eq('user_id', userId)
    .eq('bundle_key', bundleKey)
    .in('status', ['active', 'trialing']);

  const hasRealStripeForBundle = (coverRows ?? []).some(
    (r: { stripe_subscription_id: string }) =>
      !isAdminCompStripeSubscriptionId(r.stripe_subscription_id),
  );

  if (hasRealStripeForBundle) {
    return;
  }

  const cust = stripeCustomerId?.trim() || `admin_comp_cust:${userId}`;

  const { error: upsertErr } = await adminDb.from('user_subscriptions').upsert(
    {
      user_id: userId,
      bundle_key: bundleKey,
      stripe_customer_id: cust,
      stripe_subscription_id: synthId,
      stripe_price_id: ADMIN_COMP_STRIPE_PRICE_ID,
      status: 'active',
      cancelled_at: null,
      current_period_start: null,
      current_period_end: null,
      metadata: { source: 'admin_assign_plan' },
    },
    { onConflict: 'stripe_subscription_id' },
  );

  if (upsertErr) throw new Error(`Failed to upsert admin-comp subscription: ${upsertErr.message}`);
}
