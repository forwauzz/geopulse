import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ManageSubscriptionButton } from './manage-button';

export const dynamic = 'force-dynamic';

const BUNDLE_NAMES: Record<string, string> = {
  startup_lite: 'Startup Lite',
  startup_dev: 'Startup Dev',
  agency_core: 'Agency Core',
  agency_pro: 'Agency Pro',
};

const SCAN_QUOTA: Record<string, number | null> = {
  startup_lite: 3,
  startup_dev: null,
  agency_core: null,
  agency_pro: null,
};

function StatusBadge({ status }: { readonly status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: {
      label: 'Active',
      className: 'bg-primary/10 text-primary',
    },
    trialing: {
      label: 'Trial',
      className: 'bg-gold/10 text-on-surface-variant',
    },
    past_due: {
      label: 'Past due',
      className: 'bg-error/10 text-error',
    },
    cancelled: {
      label: 'Cancelled',
      className: 'bg-surface-container-high text-on-surface-variant',
    },
    incomplete: {
      label: 'Incomplete',
      className: 'bg-surface-container-high text-on-surface-variant',
    },
  };
  const entry = map[status] ?? { label: status, className: 'bg-surface-container-high text-on-surface-variant' };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${entry.className}`}>
      {entry.label}
    </span>
  );
}

function formatDate(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default async function BillingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard/billing');
  }

  // Fetch subscription + user row in parallel
  const [subResult, userResult] = await Promise.all([
    supabase
      .from('user_subscriptions')
      .select('bundle_key, status, current_period_end, created_at')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('users')
      .select('scans_this_month')
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  const sub = subResult.data;
  const scansUsed = userResult.data?.scans_this_month ?? 0;
  const quota = sub ? (SCAN_QUOTA[sub.bundle_key] ?? null) : null;

  return (
    <section className="space-y-6">

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
            Dashboard
          </p>
          <h1 className="mt-2 font-sans text-3xl font-bold text-on-background">
            Billing
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Your plan and usage overview.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface-container-high"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden>arrow_back</span>
          Dashboard
        </Link>
      </div>

      {sub ? (
        <>
          {/* ── Plan card ─────────────────────────────────────── */}
          <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low shadow-float">
            <div className="border-b border-outline-variant/10 px-6 py-4">
              <h2 className="font-sans text-base font-semibold text-on-background">Current plan</h2>
            </div>
            <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                  Plan
                </p>
                <p className="mt-1 text-sm font-medium text-on-background">
                  {BUNDLE_NAMES[sub.bundle_key] ?? sub.bundle_key}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                  Status
                </p>
                <div className="mt-1">
                  <StatusBadge status={sub.status} />
                </div>
              </div>
              {sub.current_period_end ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                    {sub.status === 'trialing' ? 'Trial ends' : 'Renews'}
                  </p>
                  <p className="mt-1 text-sm font-medium text-on-background">
                    {formatDate(sub.current_period_end)}
                  </p>
                </div>
              ) : null}
            </div>
            <div className="border-t border-outline-variant/10 px-6 py-5">
              <ManageSubscriptionButton />
              <p className="mt-2 text-xs text-on-surface-variant/70">
                Update payment method, download invoices, or cancel — managed via Stripe.
              </p>
            </div>
          </div>

          {/* ── Usage card ────────────────────────────────────── */}
          <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low shadow-float">
            <div className="border-b border-outline-variant/10 px-6 py-4">
              <h2 className="font-sans text-base font-semibold text-on-background">Usage this month</h2>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-end gap-2">
                <span className="font-sans text-4xl font-bold text-on-background tabular-nums">
                  {scansUsed}
                </span>
                <span className="mb-1 text-sm text-on-surface-variant">
                  {quota !== null ? `/ ${quota} scans` : 'scans (unlimited)'}
                </span>
              </div>
              {quota !== null ? (
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, (scansUsed / quota) * 100)}%` }}
                  />
                </div>
              ) : null}
              <p className="mt-3 text-xs text-on-surface-variant">
                Scan count resets at the start of each billing month.
              </p>
            </div>
          </div>
        </>
      ) : (
        /* ── No active subscription ───────────────────────── */
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low px-6 py-10 text-center shadow-float">
          <p className="font-sans text-base font-semibold text-on-background">No active subscription</p>
          <p className="mt-2 text-sm text-on-surface-variant">
            You are on the free tier. Upgrade to unlock more scans and features.
          </p>
          <Link
            href="/pricing"
            className="mt-6 inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition-opacity hover:opacity-90"
          >
            View plans
          </Link>
        </div>
      )}

    </section>
  );
}
