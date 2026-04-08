import Link from 'next/link';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { normalizePlanTypeForAdmin, PLAN_TYPE_VALUES } from '@/lib/server/plan-type';
import { subscriptionNeedsWorkspaceProvisioning } from '@/lib/server/subscription-provisioning-gap';
import {
  assignUserPlan,
  cancelUserSubscription,
  provisionWorkspaceAdmin,
} from '../actions';

export const dynamic = 'force-dynamic';

type SubRow = {
  id: string;
  bundle_key: string;
  status: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  current_period_start: string | null;
  current_period_end: string | null;
  startup_workspace_id: string | null;
  agency_account_id: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const ctx = await loadAdminPageContext('/admin/users');
  if (!ctx.ok) {
    return <p className="text-sm text-error">{ctx.message}</p>;
  }

  // Load user + subscriptions in parallel
  const [userResult, subsResult] = await Promise.all([
    ctx.adminDb
      .from('users')
      .select('id, email, full_name, plan, stripe_customer_id, created_at')
      .eq('id', userId)
      .maybeSingle(),
    ctx.adminDb
      .from('user_subscriptions')
      .select(
        'id, bundle_key, status, stripe_subscription_id, stripe_customer_id, current_period_start, current_period_end, startup_workspace_id, agency_account_id, cancelled_at, created_at'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .returns<SubRow[]>(),
  ]);

  const user = userResult.data;
  if (!user) {
    return (
      <div>
        <Link href="/admin/users" className="text-sm text-primary hover:underline">
          ← Back to users
        </Link>
        <p className="mt-4 text-sm text-error">User not found.</p>
      </div>
    );
  }

  const subs = subsResult.data ?? [];

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      active: 'text-green-700 dark:text-green-400',
      trialing: 'text-blue-700 dark:text-blue-400',
      past_due: 'text-amber-700 dark:text-amber-400',
      cancelled: 'text-on-surface-variant/60',
      incomplete: 'text-red-700 dark:text-red-400',
    };
    return map[status] ?? 'text-on-surface-variant';
  };

  return (
    <div className="space-y-8">
      {/* Back nav */}
      <Link href="/admin/users" className="text-sm text-primary hover:underline">
        ← Back to users
      </Link>

      {/* User profile */}
      <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-6 space-y-3">
        <h1 className="font-headline text-2xl font-bold text-on-background">
          {user.full_name ?? user.email ?? userId}
        </h1>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-on-surface-variant">Email</dt>
            <dd className="text-on-background">{user.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-on-surface-variant">Current plan</dt>
            <dd className="font-medium text-on-background">{user.plan ?? 'free'}</dd>
          </div>
          <div>
            <dt className="text-xs text-on-surface-variant">Stripe customer</dt>
            <dd className="truncate text-on-surface-variant">
              {user.stripe_customer_id ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-on-surface-variant">User ID</dt>
            <dd className="truncate text-xs text-on-surface-variant">{user.id}</dd>
          </div>
          <div>
            <dt className="text-xs text-on-surface-variant">Joined</dt>
            <dd className="text-on-surface-variant">
              {new Date(user.created_at).toLocaleDateString()}
            </dd>
          </div>
        </dl>
      </section>

      {/* Assign plan */}
      <section className="space-y-3">
        <h2 className="font-headline text-lg font-semibold text-on-background">
          Override plan
        </h2>
        <p className="text-sm text-on-surface-variant">
          Directly sets{' '}
          <code className="rounded bg-surface-container px-1 py-0.5 text-xs">users.plan</code>.
          No Stripe change — use for B2B deals, comps, or manual corrections.
        </p>
        <form action={assignUserPlan} className="flex items-end gap-3">
          <input type="hidden" name="userId" value={userId} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="plan" className="text-xs font-medium text-on-surface-variant">
              New plan
            </label>
            <select
              id="plan"
              name="plan"
              defaultValue={normalizePlanTypeForAdmin(user.plan)}
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-background focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {PLAN_TYPE_VALUES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition hover:opacity-90"
          >
            Assign plan
          </button>
        </form>
      </section>

      {/* Subscriptions */}
      <section className="space-y-4">
        <h2 className="font-headline text-lg font-semibold text-on-background">
          Subscriptions ({subs.length})
        </h2>

        {subs.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No subscriptions found.</p>
        ) : (
          <div className="space-y-4">
            {subs.map((sub) => {
              const isLive =
                sub.status === 'active' ||
                sub.status === 'trialing' ||
                sub.status === 'incomplete';
              const hasWorkspace = !!sub.startup_workspace_id || !!sub.agency_account_id;
              const showProvisionButton = subscriptionNeedsWorkspaceProvisioning(sub);

              return (
                <div
                  key={sub.id}
                  className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-on-background">{sub.bundle_key}</p>
                      <p className={`text-sm font-semibold ${statusColor(sub.status)}`}>
                        {sub.status}
                      </p>
                    </div>
                    <span className="text-xs text-on-surface-variant">
                      Created {new Date(sub.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-2 text-xs text-on-surface-variant sm:grid-cols-3">
                    <div>
                      <dt>Stripe sub ID</dt>
                      <dd className="truncate font-mono">{sub.stripe_subscription_id}</dd>
                    </div>
                    <div>
                      <dt>Period end</dt>
                      <dd>
                        {sub.current_period_end
                          ? new Date(sub.current_period_end).toLocaleDateString()
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Workspace</dt>
                      <dd>
                        {sub.startup_workspace_id
                          ? `startup: ${sub.startup_workspace_id.slice(0, 8)}…`
                          : sub.agency_account_id
                            ? `agency: ${sub.agency_account_id.slice(0, 8)}…`
                            : 'not provisioned'}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {/* Cancel */}
                    {isLive && (
                      <form action={cancelUserSubscription}>
                        <input type="hidden" name="subRowId" value={sub.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-error/30 bg-error/5 px-3 py-1.5 text-xs font-medium text-error transition hover:bg-error/10"
                        >
                          Cancel subscription
                        </button>
                      </form>
                    )}

                    {/* Provision workspace */}
                    {showProvisionButton && (
                      <form action={provisionWorkspaceAdmin}>
                        <input type="hidden" name="subRowId" value={sub.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10"
                        >
                          Provision workspace
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
