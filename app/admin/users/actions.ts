'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { createStripeClient } from '@/lib/server/stripe-client';
import { provisionWorkspaceForSubscription } from '@/lib/server/billing/provision-workspace-for-subscription';
import { syncAdminCompSubscription } from '@/lib/server/admin-comp-subscription';
import { isValidPlanType } from '@/lib/server/plan-type';
import { structuredLog } from '@/lib/server/structured-log';
import { syncUserPlanFromSubscriptions } from '@/lib/server/subscription-plan-sync';
import { hardDeleteUserAccount } from '@/lib/server/user-deletion';

// ── Assign plan directly (for B2B / comp accounts — no Stripe change) ────────
export async function assignUserPlan(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) throw new Error(ctx.message);

  const userId = (formData.get('userId') as string | null)?.trim();
  const plan = (formData.get('plan') as string | null)?.trim();
  if (!userId || !plan) throw new Error('userId and plan are required.');

  if (!isValidPlanType(plan)) throw new Error(`Invalid plan: ${plan}`);

  const { data: userRow, error: fetchErr } = await ctx.adminDb
    .from('users')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  if (fetchErr) throw new Error(`Failed to load user: ${fetchErr.message}`);

  await syncAdminCompSubscription(ctx.adminDb, userId, plan, userRow?.stripe_customer_id ?? null);

  const { error } = await ctx.adminDb
    .from('users')
    .update({ plan })
    .eq('id', userId);

  if (error) throw new Error(`Failed to assign plan: ${error.message}`);

  structuredLog('admin_assign_user_plan', { adminId: ctx.user.id, userId, plan }, 'info');
  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);
}

// ── Cancel a Stripe subscription on behalf of a user ──────────────────────────
export async function cancelUserSubscription(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) throw new Error(ctx.message);

  const subRowId = (formData.get('subRowId') as string | null)?.trim();
  if (!subRowId) throw new Error('subRowId is required.');

  // Get the subscription row
  const { data: subRow, error: fetchErr } = await ctx.adminDb
    .from('user_subscriptions')
    .select('id, user_id, stripe_subscription_id, status')
    .eq('id', subRowId)
    .maybeSingle();

  if (fetchErr || !subRow) throw new Error('Subscription not found.');
  if (subRow.status === 'cancelled') throw new Error('Subscription is already cancelled.');

  // Cancel in Stripe — use getPaymentApiEnv for STRIPE_SECRET_KEY
  const paymentEnv = await getPaymentApiEnv();
  const stripeKey = paymentEnv.STRIPE_SECRET_KEY;
  if (!stripeKey?.trim()) throw new Error('Stripe not configured.');

  const stripe = createStripeClient(stripeKey);
  await stripe.subscriptions.cancel(subRow.stripe_subscription_id);

  // Update DB (webhook will also fire and update, but be proactive)
  await ctx.adminDb
    .from('user_subscriptions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', subRowId);

  await syncUserPlanFromSubscriptions({ supabase: ctx.adminDb, userId: subRow.user_id });

  await syncAdminCompSubscription(ctx.adminDb, subRow.user_id, 'free', null);

  structuredLog('admin_cancel_subscription', {
    adminId: ctx.user.id,
    userId: subRow.user_id,
    subRowId,
    stripeSubId: subRow.stripe_subscription_id,
  }, 'info');

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${subRow.user_id}`);
}

// ── Manually provision workspace for an existing subscription ─────────────────
export async function provisionWorkspaceAdmin(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) throw new Error(ctx.message);

  const subRowId = (formData.get('subRowId') as string | null)?.trim();
  if (!subRowId) throw new Error('subRowId is required.');

  // Get the subscription + user info
  const { data: subRow } = await ctx.adminDb
    .from('user_subscriptions')
    .select('id, user_id, bundle_key, stripe_subscription_id, startup_workspace_id, agency_account_id')
    .eq('id', subRowId)
    .maybeSingle();

  if (!subRow) throw new Error('Subscription not found.');
  if (subRow.startup_workspace_id || subRow.agency_account_id) {
    throw new Error('Workspace already provisioned for this subscription.');
  }

  const { data: userRow } = await ctx.adminDb
    .from('users')
    .select('email')
    .eq('id', subRow.user_id)
    .maybeSingle();

  if (!userRow?.email) throw new Error('User email not found.');

  const result = await provisionWorkspaceForSubscription(ctx.adminDb, {
    userId: subRow.user_id,
    userEmail: userRow.email,
    bundleKey: subRow.bundle_key,
    subscriptionId: subRow.stripe_subscription_id,
  });

  if (!result.startupWorkspaceId && !result.agencyAccountId) {
    throw new Error('Workspace provisioning did not produce a workspace ID. Check server logs.');
  }

  structuredLog('admin_provision_workspace', {
    adminId: ctx.user.id,
    userId: subRow.user_id,
    subRowId,
    bundleKey: subRow.bundle_key,
  }, 'info');

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${subRow.user_id}`);
}

export async function deleteUserAccount(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) throw new Error(ctx.message);

  const userId = (formData.get('userId') as string | null)?.trim();
  const confirmEmail = (formData.get('confirmEmail') as string | null)?.trim();
  if (!userId || !confirmEmail) {
    throw new Error('userId and confirmEmail are required.');
  }

  const result = await hardDeleteUserAccount({
    adminDb: ctx.adminDb,
    requestedByUserId: ctx.user.id,
    targetUserId: userId,
    confirmEmail,
  });

  structuredLog(
    'admin_delete_user_account',
    {
      adminId: ctx.user.id,
      userId,
      deletedEmail: result.deletedEmail,
      deletedScans: result.deletedScans,
      deletedPayments: result.deletedPayments,
      cancelledStripeSubscriptionCount: result.cancelledStripeSubscriptionIds.length,
      cancelledStripeSubscriptionSample: result.cancelledStripeSubscriptionIds[0] ?? null,
    },
    'warning',
  );

  revalidatePath('/admin/users');
  redirect('/admin/users');
}
