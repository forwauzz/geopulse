import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanType } from '@/lib/server/plan-type';

type CoarseSubscriptionRow = {
  readonly bundle_key: string;
  readonly stripe_subscription_id: string;
  readonly status: string;
};

function bundleToPlan(bundleKey: string): PlanType {
  switch (bundleKey) {
    case 'startup_dev':
      return 'pro';
    case 'agency_core':
    case 'agency_pro':
      return 'agency';
    default:
      return 'free';
  }
}

function planRank(plan: PlanType): number {
  switch (plan) {
    case 'agency':
      return 2;
    case 'pro':
      return 1;
    default:
      return 0;
  }
}

export function resolvePlanFromSubscriptions(rows: readonly CoarseSubscriptionRow[]): PlanType {
  let best: PlanType = 'free';

  for (const row of rows) {
    if (row.status !== 'active' && row.status !== 'trialing') {
      continue;
    }

    const plan = bundleToPlan(row.bundle_key);
    if (planRank(plan) > planRank(best)) {
      best = plan;
    }
  }

  return best;
}

export async function syncUserPlanFromSubscriptions(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<PlanType> {
  const { data, error } = await args.supabase
    .from('user_subscriptions')
    .select('bundle_key,stripe_subscription_id,status')
    .eq('user_id', args.userId)
    .in('status', ['active', 'trialing']);

  if (error) {
    throw new Error(`Failed to load subscriptions: ${error.message}`);
  }

  const nextPlan = resolvePlanFromSubscriptions((data ?? []) as CoarseSubscriptionRow[]);

  const { error: updateError } = await args.supabase
    .from('users')
    .update({ plan: nextPlan })
    .eq('id', args.userId);

  if (updateError) {
    throw new Error(`Failed to sync user plan: ${updateError.message}`);
  }

  return nextPlan;
}
