import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { userHasFeature } from '@/lib/server/user-feature-grants';
import { loadUserSchedule } from '@/lib/server/recurring-audits';
import { saveRecurringSchedule } from './actions';

export const dynamic = 'force-dynamic';

const input =
  'min-h-[42px] w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 font-body text-sm text-on-surface outline-none focus:ring-2 focus:ring-tertiary/30';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function DashboardAutomationPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/automation');

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) redirect('/dashboard');
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const allowed = (await isUserPlatformAdmin(user.id, admin)) || (await userHasFeature(admin, user.id, 'automation'));
  if (!allowed) redirect('/dashboard');

  const schedule = await loadUserSchedule(admin, user.id);
  const { data: recentData } = await admin
    .from('scans')
    .select('id, url, score, letter_grade, created_at')
    .eq('user_id', user.id)
    .eq('run_source', 'recurring')
    .order('created_at', { ascending: false })
    .limit(8);
  const recent = (recentData ?? []) as { id: string; url: string; score: number | null; letter_grade: string | null; created_at: string }[];

  return (
    <div className="space-y-6">
      <header>
        <p className="font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Workspace</p>
        <h1 className="mt-1 font-sans text-2xl font-black uppercase tracking-tight text-on-background">Automation</h1>
        <p className="mt-1 font-sans text-sm text-on-surface-variant">
          Set your site to be re-audited automatically. We’ll run the same audit on a schedule and save each result to your history.
        </p>
      </header>

      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <h2 className="font-sans text-lg font-bold text-on-background">Recurring audit</h2>
        <form action={saveRecurringSchedule} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Website to audit</span>
            <input name="url" type="url" required defaultValue={schedule?.url ?? ''} placeholder="https://yourcompany.com" className={input} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">How often</span>
              <select name="cadence" defaultValue={schedule?.cadence ?? 'weekly'} className={input}>
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button type="submit" name="enabled" value="true" className="inline-flex min-h-[42px] flex-1 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary transition hover:bg-primary-dim">
                {schedule?.enabled ? 'Save & keep on' : 'Turn on'}
              </button>
              {schedule?.enabled ? (
                <button type="submit" name="enabled" value="false" className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-surface-container px-4 text-sm font-semibold text-on-surface-variant transition hover:text-on-background">
                  Turn off
                </button>
              ) : null}
            </div>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-outline-variant/20 pt-4 font-sans text-xs text-on-surface-variant">
          <span>Status: <strong className={schedule?.enabled ? 'text-primary' : 'text-on-surface-variant'}>{schedule?.enabled ? 'On' : 'Off'}</strong></span>
          <span>Next run: {schedule?.enabled ? fmt(schedule.nextRunAt) : '—'}</span>
          <span>Last run: {fmt(schedule?.lastRunAt ?? null)}</span>
        </div>
      </section>

      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <h2 className="font-sans text-lg font-bold text-on-background">Recent automatic audits</h2>
        {recent.length > 0 ? (
          <ul className="mt-3 divide-y divide-outline-variant/20">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate font-sans text-sm text-on-background">{r.url}</span>
                <span className="shrink-0 font-sans text-sm text-on-surface-variant">
                  <span className="font-black tabular-nums text-on-background">{r.score ?? '—'}</span>
                  {r.letter_grade ? ` (${r.letter_grade})` : ''} · {fmt(r.created_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 font-sans text-xs text-on-surface-variant">No automatic audits yet — they’ll appear here once the schedule runs.</p>
        )}
      </section>
    </div>
  );
}
