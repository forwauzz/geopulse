import type { SupabaseClient } from '@supabase/supabase-js';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { createStripeClient } from '@/lib/server/stripe-client';

type UserDeletionTarget = {
  readonly id: string;
  readonly email: string | null;
};

type ActiveSubscriptionRow = {
  readonly stripe_subscription_id: string;
  readonly status: string;
};

type DeleteSpec = {
  readonly table: string;
  readonly columns: readonly string[];
};

const USER_OWNED_ARTIFACT_DELETE_SPECS: readonly DeleteSpec[] = [
  { table: 'content_items', columns: ['created_by_user_id', 'approved_by_user_id'] },
  { table: 'distribution_accounts', columns: ['connected_by_user_id'] },
  { table: 'distribution_assets', columns: ['created_by_user_id', 'approved_by_user_id'] },
  { table: 'distribution_jobs', columns: ['created_by_user_id'] },
  { table: 'startup_recommendations', columns: ['created_by_user_id', 'status_updated_by_user_id'] },
  { table: 'startup_audit_executions', columns: ['created_by_user_id'] },
  { table: 'startup_audit_execution_events', columns: ['changed_by_user_id'] },
  { table: 'startup_implementation_plans', columns: ['created_by_user_id'] },
  { table: 'startup_github_installations', columns: ['connected_by_user_id'] },
  { table: 'startup_github_install_sessions', columns: ['requested_by_user_id'] },
  { table: 'startup_slack_installations', columns: ['installed_by_user_id'] },
  { table: 'startup_slack_install_sessions', columns: ['requested_by_user_id'] },
  { table: 'startup_agent_pr_runs', columns: ['queued_by_user_id'] },
];

export type HardDeleteUserAccountArgs = {
  readonly adminDb: SupabaseClient;
  readonly requestedByUserId: string;
  readonly targetUserId: string;
  readonly confirmEmail: string;
};

export type HardDeleteUserAccountResult = {
  readonly deletedEmail: string;
  readonly cancelledStripeSubscriptionIds: string[];
  readonly deletedScans: number;
  readonly deletedPayments: number;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function loadTargetUser(
  adminDb: SupabaseClient,
  targetUserId: string,
): Promise<UserDeletionTarget> {
  const { data, error } = await adminDb
    .from('users')
    .select('id, email')
    .eq('id', targetUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load target user: ${error.message}`);
  }

  if (!data) {
    throw new Error('User not found.');
  }

  return data as UserDeletionTarget;
}

async function loadActiveSubscriptions(
  adminDb: SupabaseClient,
  targetUserId: string,
): Promise<ActiveSubscriptionRow[]> {
  const { data, error } = await adminDb
    .from('user_subscriptions')
    .select('stripe_subscription_id, status')
    .eq('user_id', targetUserId)
    .in('status', ['active', 'trialing', 'past_due', 'incomplete']);

  if (error) {
    throw new Error(`Failed to load subscriptions: ${error.message}`);
  }

  return (data ?? []) as ActiveSubscriptionRow[];
}

async function deleteRowsMatchingUser(
  adminDb: SupabaseClient,
  spec: DeleteSpec,
  targetUserId: string,
): Promise<number> {
  let deletedCount = 0;

  for (const column of spec.columns) {
    const { data, error } = await adminDb
      .from(spec.table)
      .delete()
      .eq(column, targetUserId)
      .select('id');

    if (error) {
      throw new Error(`Failed to delete ${spec.table}: ${error.message}`);
    }

    deletedCount += data?.length ?? 0;
  }

  return deletedCount;
}

export async function hardDeleteUserAccount(
  args: HardDeleteUserAccountArgs,
): Promise<HardDeleteUserAccountResult> {
  const targetUser = await loadTargetUser(args.adminDb, args.targetUserId);

  const targetEmail = normalizeEmail(targetUser.email ?? '');
  const confirmEmail = normalizeEmail(args.confirmEmail);
  if (!targetEmail || targetEmail !== confirmEmail) {
    throw new Error('Confirmation email does not match the target user.');
  }

  if (args.targetUserId === args.requestedByUserId) {
    throw new Error('You cannot delete your own account while signed in.');
  }

  if (await isUserPlatformAdmin(args.targetUserId, args.adminDb)) {
    throw new Error('Platform admin accounts cannot be deleted from this screen.');
  }

  const liveSubscriptions = await loadActiveSubscriptions(args.adminDb, args.targetUserId);
  const cancelableSubscriptions = liveSubscriptions.filter(
    (sub) => !sub.stripe_subscription_id.startsWith('admin_comp:'),
  );

  const cancelledStripeSubscriptionIds: string[] = [];
  if (cancelableSubscriptions.length > 0) {
    const paymentEnv = await getPaymentApiEnv();
    if (!paymentEnv.STRIPE_SECRET_KEY?.trim()) {
      throw new Error('Stripe is not configured for cancelling live subscriptions.');
    }

    const stripe = createStripeClient(paymentEnv.STRIPE_SECRET_KEY);
    for (const sub of cancelableSubscriptions) {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      cancelledStripeSubscriptionIds.push(sub.stripe_subscription_id);
    }
  }

  for (const spec of USER_OWNED_ARTIFACT_DELETE_SPECS) {
    await deleteRowsMatchingUser(args.adminDb, spec, args.targetUserId);
  }

  const { data: scans, error: scanDeleteError } = await args.adminDb
    .from('scans')
    .delete()
    .eq('user_id', args.targetUserId)
    .select('id');

  if (scanDeleteError) {
    throw new Error(`Failed to delete user scans: ${scanDeleteError.message}`);
  }

  const { data: payments, error: paymentDeleteError } = await args.adminDb
    .from('payments')
    .delete()
    .eq('user_id', args.targetUserId)
    .select('id');

  if (paymentDeleteError) {
    throw new Error(`Failed to delete user payments: ${paymentDeleteError.message}`);
  }

  const { error: authDeleteError } = await args.adminDb.auth.admin.deleteUser(args.targetUserId);
  if (authDeleteError) {
    throw new Error(`Failed to delete auth user: ${authDeleteError.message}`);
  }

  return {
    deletedEmail: targetUser.email ?? '',
    cancelledStripeSubscriptionIds,
    deletedScans: scans?.length ?? 0,
    deletedPayments: payments?.length ?? 0,
  };
}
