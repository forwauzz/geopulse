import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { structuredLog, structuredError } from '@/lib/server/structured-log';
import { provisionWorkspaceForSubscription } from '@/lib/server/billing/provision-workspace-for-subscription';
import { syncUserPlanFromSubscriptions } from '@/lib/server/subscription-plan-sync';

// ── Status mapping ───────────────────────────────────────────────────────────

type UserSubStatus = 'active' | 'trialing' | 'past_due' | 'cancelled' | 'incomplete';

function mapStripeStatus(stripeStatus: Stripe.Subscription['status']): UserSubStatus {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'incomplete':
      return 'incomplete';
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelled';
    default:
      // 'unpaid' | 'paused' — treat as past_due (safe degraded state)
      return 'past_due';
  }
}

// ── handleSubscriptionUpserted ───────────────────────────────────────────────

/**
 * Idempotent upsert for `customer.subscription.created` and
 * `customer.subscription.updated`. Provisions workspace on first
 * `active` or `trialing` event.
 */
export async function handleSubscriptionUpserted(
  supabase: SupabaseClient,
  subscription: Stripe.Subscription
): Promise<void> {
  const userId = subscription.metadata?.['user_id'];
  const bundleKey = subscription.metadata?.['bundle_key'];
  const organizationName = subscription.metadata?.['organization_name']?.trim() ?? '';
  const websiteUrl = subscription.metadata?.['website_url']?.trim() ?? '';

  if (!userId || !bundleKey) {
    structuredLog('subscription_upserted_missing_metadata', {
      subscriptionId: subscription.id,
      hasUserId: Boolean(userId),
      hasBundleKey: Boolean(bundleKey),
    }, 'warning');
    return; // Not our subscription (e.g. one-time checkout from old path) — skip silently
  }

  const status = mapStripeStatus(subscription.status);
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? '';

  const priceId =
    subscription.items?.data?.[0]?.price?.id ?? '';

  const periodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000).toISOString()
    : null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  // Upsert the subscription row
  const { data: upserted, error: upsertErr } = await supabase
    .from('user_subscriptions')
    .upsert(
      {
        user_id: userId,
        bundle_key: bundleKey,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        status,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        metadata: {
          ...(organizationName ? { organization_name: organizationName } : {}),
        },
      },
      { onConflict: 'stripe_subscription_id' }
    )
    .select('id, startup_workspace_id, agency_account_id')
    .maybeSingle();

  if (upsertErr) {
    structuredError('subscription_upsert_failed', {
      subscriptionId: subscription.id,
      userId,
      bundleKey,
      error: upsertErr.message,
    });
    return;
  }

  await syncUserPlanFromSubscriptions({ supabase, userId });

  // Provision workspace on first active or trialing event (card provided = real user)
  const shouldProvision =
    (status === 'active' || status === 'trialing') &&
    upserted?.startup_workspace_id == null &&
    upserted?.agency_account_id == null;

  if (shouldProvision) {
    // Look up user email for workspace key derivation
    const { data: userRow } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle();

    const userEmail = userRow?.email ?? '';

    const provisioned = await provisionWorkspaceForSubscription(supabase, {
      userId,
      userEmail,
      bundleKey,
      subscriptionId: subscription.id,
      organizationName: organizationName || null,
      websiteUrl: websiteUrl || null,
    });

    structuredLog('subscription_upserted', {
      subscriptionId: subscription.id,
      userId,
      bundleKey,
      status,
      provisioned: true,
      startupWorkspaceId: provisioned.startupWorkspaceId ?? '',
      agencyAccountId: provisioned.agencyAccountId ?? '',
    }, 'info');
  } else {
    structuredLog('subscription_upserted', {
      subscriptionId: subscription.id,
      userId,
      bundleKey,
      status,
      provisioned: false,
    }, 'info');
  }
}

// ── handleSubscriptionCancelled ──────────────────────────────────────────────

/**
 * Marks subscription as cancelled and resets users.plan to 'free'.
 * Workspace/account data is preserved — NOT deleted.
 */
export async function handleSubscriptionCancelled(
  supabase: SupabaseClient,
  subscription: Stripe.Subscription
): Promise<void> {
  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);

  if (error) {
    structuredError('subscription_cancel_update_failed', {
      subscriptionId: subscription.id,
      error: error.message,
    });
    return;
  }

  const userId = subscription.metadata?.['user_id'];
  if (userId) {
    await syncUserPlanFromSubscriptions({ supabase, userId });
  }

  structuredLog('subscription_cancelled', {
    subscriptionId: subscription.id,
    userId: userId ?? '',
  }, 'info');
}

// ── handleInvoicePaid ────────────────────────────────────────────────────────

/**
 * Updates billing period window on each successful invoice payment.
 * Ensures status stays `active` after trial-to-paid conversion.
 */
export async function handleInvoicePaid(
  supabase: SupabaseClient,
  invoice: Stripe.Invoice
): Promise<void> {
  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id ?? null;

  if (!subscriptionId) {
    // Not a subscription invoice (e.g. one-time) — skip
    return;
  }

  const periodStart = invoice.period_start
    ? new Date(invoice.period_start * 1000).toISOString()
    : null;
  const periodEnd = invoice.period_end
    ? new Date(invoice.period_end * 1000).toISOString()
    : null;

  const { data: subRow } = await supabase
    .from('user_subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      status: 'active', // invoice paid = definitely active now
      current_period_start: periodStart,
      current_period_end: periodEnd,
    })
    .eq('stripe_subscription_id', subscriptionId);

  if (error) {
    structuredError('invoice_paid_update_failed', {
      subscriptionId,
      invoiceId: invoice.id ?? '',
      error: error.message,
    });
    return;
  }

  const userId = subRow?.user_id ?? null;
  if (userId) {
    await syncUserPlanFromSubscriptions({ supabase, userId });
  }

  structuredLog('subscription_invoice_paid', {
    subscriptionId,
    invoiceId: invoice.id ?? '',
    amountPaid: invoice.amount_paid ?? 0,
  }, 'info');
}

// ── handleInvoiceFailed ──────────────────────────────────────────────────────

/**
 * Marks subscription as `past_due` when a payment attempt fails.
 */
export async function handleInvoiceFailed(
  supabase: SupabaseClient,
  invoice: Stripe.Invoice
): Promise<void> {
  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id ?? null;

  if (!subscriptionId) {
    return;
  }

  const { data: subRow } = await supabase
    .from('user_subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  const { error } = await supabase
    .from('user_subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', subscriptionId);

  if (error) {
    structuredError('invoice_failed_update_failed', {
      subscriptionId,
      invoiceId: invoice.id ?? '',
      error: error.message,
    });
    return;
  }

  const userId = subRow?.user_id ?? null;
  if (userId) {
    await syncUserPlanFromSubscriptions({ supabase, userId });
  }

  structuredLog('subscription_invoice_failed', {
    subscriptionId,
    invoiceId: invoice.id ?? '',
    attemptCount: invoice.attempt_count ?? 0,
  }, 'info');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

