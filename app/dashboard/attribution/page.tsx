import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { requireAdminOrRedirect } from '@/lib/server/require-admin';

export const dynamic = 'force-dynamic';

type FunnelRow = {
  week_start: string;
  channel: string;
  utm_source: string | null;
  utm_campaign: string | null;
  sessions: number;
  scans_started: number;
  scans_completed: number;
  leads_submitted: number;
  checkouts_started: number;
  payments_completed: number;
};

type ConversionRow = {
  conversion_event_id: string;
  payment_ts: string;
  first_touch_channel: string | null;
  first_touch_utm_source: string | null;
  first_touch_utm_campaign: string | null;
  last_touch_channel: string | null;
  last_touch_utm_source: string | null;
  last_touch_utm_campaign: string | null;
  seconds_to_convert_from_first_touch: number | null;
};

function formatWeek(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtNum(n: number | null | undefined): string {
  return typeof n === 'number' ? n.toLocaleString('en-US') : '—';
}

function fmtHours(seconds: number | null): string {
  if (seconds == null) return '—';
  const hrs = Math.round(seconds / 3600);
  return hrs < 1 ? '<1h' : `${String(hrs)}h`;
}

export default async function AttributionAdminPage() {
  const supabaseSession = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabaseSession.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard/attribution');
  }

  requireAdminOrRedirect(user.email);

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-error">Server misconfigured: missing Supabase service role.</p>
      </main>
    );
  }

  const adminDb = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: funnel, error: funnelErr } = await adminDb
    .schema('analytics')
    .from('channel_funnel_weekly_v1')
    .select('*')
    .order('week_start', { ascending: false })
    .order('payments_completed', { ascending: false })
    .limit(200);

  const { data: conversions, error: convErr } = await adminDb
    .schema('analytics')
    .from('attribution_conversions_v1')
    .select(
      'conversion_event_id,payment_ts,first_touch_channel,first_touch_utm_source,first_touch_utm_campaign,last_touch_channel,last_touch_utm_source,last_touch_utm_campaign,seconds_to_convert_from_first_touch'
    )
    .order('payment_ts', { ascending: false })
    .limit(100);

  if (funnelErr || convErr) {
    const msg = funnelErr?.message ?? convErr?.message ?? 'Unknown error';
    const isMissingAnalyticsSchema = /Invalid schema:\s*analytics/i.test(msg);
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">Attribution</h1>
        <p className="mt-4 text-error">
          Could not load analytics.
          <br />
          {msg}
        </p>
        {isMissingAnalyticsSchema ? (
          <div className="mt-6 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 font-body text-sm text-on-surface-variant">
            Your database is missing the marketing attribution migrations (creates the <code>analytics</code> schema and views).
            Run <code>npm run db:migrate</code> (or apply <code>supabase/migrations/007_marketing_attribution.sql</code> and{' '}
            <code>008_marketing_attribution_views.sql</code>) against the Supabase project you’re using locally.
          </div>
        ) : null}
      </main>
    );
  }

  const funnelRows = (funnel ?? []) as FunnelRow[];
  const conversionRows = (conversions ?? []) as ConversionRow[];

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">
            Admin
          </p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
            Marketing attribution
          </h1>
          <p className="mt-1 font-body text-on-surface-variant">
            Weekly funnel and first/last-touch conversions (v1).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/evals"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
          >
            Report evals
          </Link>
          <Link
            href="/dashboard/benchmarks"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
          >
            Benchmarks
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
          >
            Account
          </Link>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="font-headline text-xl font-bold text-on-background">Weekly funnel</h2>
        <div className="mt-4 overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
          <table className="min-w-[900px] w-full border-collapse text-left font-body text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-on-surface-variant">
                <th className="px-4 py-3">Week</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3 text-right">Scans</th>
                <th className="px-4 py-3 text-right">Leads</th>
                <th className="px-4 py-3 text-right">Checkouts</th>
                <th className="px-4 py-3 text-right">Paid</th>
              </tr>
            </thead>
            <tbody>
              {funnelRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-on-surface-variant" colSpan={8}>
                    No data yet.
                  </td>
                </tr>
              ) : (
                funnelRows.map((r, idx) => (
                  <tr key={`${r.week_start}-${r.channel}-${idx}`} className="border-t border-outline-variant/10">
                    <td className="px-4 py-3">{formatWeek(r.week_start)}</td>
                    <td className="px-4 py-3">{r.channel}</td>
                    <td className="px-4 py-3">{r.utm_source ?? '—'}</td>
                    <td className="px-4 py-3">{r.utm_campaign ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{fmtNum(r.scans_completed)}</td>
                    <td className="px-4 py-3 text-right">{fmtNum(r.leads_submitted)}</td>
                    <td className="px-4 py-3 text-right">{fmtNum(r.checkouts_started)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-on-background">{fmtNum(r.payments_completed)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-headline text-xl font-bold text-on-background">Recent conversions</h2>
        <div className="mt-4 overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
          <table className="min-w-[980px] w-full border-collapse text-left font-body text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-on-surface-variant">
                <th className="px-4 py-3">Paid at</th>
                <th className="px-4 py-3">First-touch</th>
                <th className="px-4 py-3">Last-touch</th>
                <th className="px-4 py-3 text-right">Time to convert</th>
              </tr>
            </thead>
            <tbody>
              {conversionRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-on-surface-variant" colSpan={4}>
                    No conversions yet.
                  </td>
                </tr>
              ) : (
                conversionRows.map((r) => (
                  <tr key={r.conversion_event_id} className="border-t border-outline-variant/10">
                    <td className="px-4 py-3">
                      {new Date(r.payment_ts).toLocaleString('en-US')}
                    </td>
                    <td className="px-4 py-3">
                      {(r.first_touch_channel ?? 'direct_or_unknown') +
                        (r.first_touch_utm_source ? ` · ${r.first_touch_utm_source}` : '') +
                        (r.first_touch_utm_campaign ? ` · ${r.first_touch_utm_campaign}` : '')}
                    </td>
                    <td className="px-4 py-3">
                      {(r.last_touch_channel ?? 'direct_or_unknown') +
                        (r.last_touch_utm_source ? ` · ${r.last_touch_utm_source}` : '') +
                        (r.last_touch_utm_campaign ? ` · ${r.last_touch_utm_campaign}` : '')}
                    </td>
                    <td className="px-4 py-3 text-right">{fmtHours(r.seconds_to_convert_from_first_touch)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

