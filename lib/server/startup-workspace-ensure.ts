import type { SupabaseClient } from '@supabase/supabase-js';
import { createStripeClient } from './stripe-client';
import { handleSubscriptionUpserted } from './stripe/subscription-handlers';
import { provisionWorkspaceForSubscription } from './billing/provision-workspace-for-subscription';
import { structuredLog, structuredError } from './structured-log';

export type EnsureStartupWorkspaceResult =
  | { readonly kind: 'already_exists'; readonly workspaceId: string }
  | { readonly kind: 'provisioned'; readonly workspaceId: string }
  | { readonly kind: 'no_stripe_customer' }
  | { readonly kind: 'no_stripe_subscription' }
  | { readonly kind: 'provision_failed' };

/**
 * Self-healing workspace provisioner.
 *
 * Covers two failure scenarios:
 *
 * A) Subscription in DB, startup_workspace_id IS NULL
 *    → provisions workspace directly using DB data (no Stripe call needed)
 *
 * B) No subscription in DB (webhook never fired / not configured)
 *    → syncs the user's Stripe subscriptions into DB via handleSubscriptionUpserted
 *    → workspace is provisioned as a side-effect
 *
 * Safe to call idempotently — both provisioning paths use upserts.
 */
export async function ensureStartupWorkspace(args: {
  readonly supabase: SupabaseClient;
  readonly stripeSecretKey: string;
  readonly userId: string;
}): Promise<EnsureStartupWorkspaceResult> {
  const { supabase, stripeSecretKey, userId } = args;

  // ── Case A: subscription row exists ─────────────────────────────────────────
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('id, bundle_key, stripe_subscription_id, stripe_customer_id, status, startup_workspace_id, metadata')
    .eq('user_id', userId)
    .eq('bundle_key', 'startup_dev')
    .in('status', ['active', 'trialing', 'incomplete'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sub) {
    if (sub.startup_workspace_id) {
      structuredLog('ensure_startup_workspace_already_exists', { userId, workspaceId: sub.startup_workspace_id }, 'info');
      return { kind: 'already_exists', workspaceId: sub.startup_workspace_id };
    }

    // Subscription exists but workspace wasn't provisioned — provision now
    const { data: userRow } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle();

    const organizationName =
      (sub.metadata as Record<string, string> | null)?.['organization_name'] ?? null;

    const provisioned = await provisionWorkspaceForSubscription(supabase, {
      userId,
      userEmail: userRow?.email ?? '',
      bundleKey: sub.bundle_key,
      subscriptionId: sub.stripe_subscription_id,
      organizationName,
    });

    if (provisioned.startupWorkspaceId) {
      structuredLog('ensure_startup_workspace_provisioned_from_db', {
        userId,
        workspaceId: provisioned.startupWorkspaceId,
      }, 'info');
      return { kind: 'provisioned', workspaceId: provisioned.startupWorkspaceId };
    }

    structuredError('ensure_startup_workspace_provision_failed', { userId });
    return { kind: 'provision_failed' };
  }

  // ── Case B: no subscription row — sync from Stripe ──────────────────────────
  const { data: userRow } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  if (!userRow?.stripe_customer_id) {
    structuredLog('ensure_startup_workspace_no_stripe_customer', { userId }, 'info');
    return { kind: 'no_stripe_customer' };
  }

  const stripe = createStripeClient(stripeSecretKey);

  let subscriptions: Awaited<ReturnType<typeof stripe.subscriptions.list>>;
  try {
    subscriptions = await stripe.subscriptions.list({
      customer: userRow.stripe_customer_id,
      limit: 10,
    });
  } catch (err) {
    structuredError('ensure_startup_workspace_stripe_list_failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { kind: 'provision_failed' };
  }

  const startupSubs = subscriptions.data.filter(
    (s) => s.metadata?.['bundle_key'] === 'startup_dev' && s.metadata?.['user_id']
  );

  if (startupSubs.length === 0) {
    structuredLog('ensure_startup_workspace_no_stripe_subscription', { userId }, 'info');
    return { kind: 'no_stripe_subscription' };
  }

  // Process subscriptions newest-first; stop on first provisioned workspace
  const sorted = [...startupSubs].sort((a, b) => b.created - a.created);
  for (const stripeSub of sorted) {
    try {
      await handleSubscriptionUpserted(supabase, stripeSub);
    } catch (err) {
      structuredError('ensure_startup_workspace_upsert_failed', {
        userId,
        subscriptionId: stripeSub.id,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    // Check if workspace was provisioned by the upsert
    const { data: refreshed } = await supabase
      .from('user_subscriptions')
      .select('startup_workspace_id')
      .eq('stripe_subscription_id', stripeSub.id)
      .maybeSingle();

    if (refreshed?.startup_workspace_id) {
      structuredLog('ensure_startup_workspace_provisioned_from_stripe', {
        userId,
        workspaceId: refreshed.startup_workspace_id,
        subscriptionId: stripeSub.id,
      }, 'info');
      return { kind: 'provisioned', workspaceId: refreshed.startup_workspace_id };
    }
  }

  structuredError('ensure_startup_workspace_provision_failed_after_sync', { userId });
  return { kind: 'provision_failed' };
}
