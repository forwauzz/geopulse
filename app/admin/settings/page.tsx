import Link from 'next/link';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { loadUiFlags, UI_FLAG_KEYS, UI_FLAG_LABELS, type UiFlagKey } from '@/lib/server/app-ui-flags';
import {
  listGrantedUsers,
  USER_FEATURE_KEYS,
  USER_FEATURE_LABELS,
} from '@/lib/server/user-feature-grants';
import { setAppUiFlag, grantUserFeature, renameWorkspace } from './actions';

export const dynamic = 'force-dynamic';

const card = 'rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6';
const kicker = 'font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant';
const input =
  'min-h-[38px] rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 font-body text-sm text-on-surface outline-none focus:ring-2 focus:ring-tertiary/30';
const btn = 'inline-flex min-h-[38px] items-center justify-center rounded-xl px-4 text-sm font-semibold transition';

function Toggle({ flagKey, current }: { flagKey: UiFlagKey; current: boolean }) {
  return (
    <form action={setAppUiFlag}>
      <input type="hidden" name="key" value={flagKey} />
      <input type="hidden" name="value" value={current ? 'false' : 'true'} />
      <button
        type="submit"
        className={`inline-flex min-h-[34px] min-w-[92px] items-center justify-center gap-2 rounded-full px-3 text-xs font-semibold transition ${
          current ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${current ? 'bg-primary' : 'bg-outline-variant'}`} />
        {current ? 'Shown' : 'Hidden'}
      </button>
    </form>
  );
}

export default async function AppSettingsPage() {
  const env = await getPaymentApiEnv();
  const flags = await loadUiFlags();

  const supabase =
    env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      : null;

  const grants = supabase ? await listGrantedUsers(supabase) : [];
  const { data: workspacesData } = supabase
    ? await supabase.from('startup_workspaces').select('id, name').order('created_at', { ascending: false }).limit(30)
    : { data: [] as { id: string; name: string }[] };
  const workspaces = (workspacesData ?? []) as { id: string; name: string }[];

  return (
    <div className="space-y-6">
      <header>
        <p className={kicker}>Admin · App</p>
        <h1 className="mt-1 font-sans text-2xl font-black uppercase tracking-tight text-on-background">Settings</h1>
        <p className="mt-1 font-sans text-sm text-on-surface-variant">
          Show or hide sections of the app and assign features to specific users. Changes are live.
        </p>
      </header>

      {/* Global visibility */}
      <section className={card}>
        <h2 className="font-sans text-lg font-bold text-on-background">Visibility</h2>
        <ul className="mt-4 divide-y divide-outline-variant/20">
          {UI_FLAG_KEYS.map((key) => (
            <li key={key} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-sans text-sm font-semibold text-on-background">{UI_FLAG_LABELS[key].label}</p>
                <p className="mt-0.5 font-sans text-xs text-on-surface-variant">{UI_FLAG_LABELS[key].help}</p>
              </div>
              <Toggle flagKey={key} current={flags[key]} />
            </li>
          ))}
        </ul>
      </section>

      {/* Per-user feature grants */}
      <section className={card}>
        <h2 className="font-sans text-lg font-bold text-on-background">User access</h2>
        <p className="mt-0.5 font-sans text-xs text-on-surface-variant">
          Give a specific user a feature (they don’t need to be an admin). Enter their account email.
        </p>
        <form action={grantUserFeature} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input name="email" type="email" required placeholder="user@example.com" className={`${input} flex-1`} />
          <select name="feature" className={input} defaultValue={USER_FEATURE_KEYS[0]}>
            {USER_FEATURE_KEYS.map((f) => (
              <option key={f} value={f}>{USER_FEATURE_LABELS[f].label}</option>
            ))}
          </select>
          <button type="submit" name="granted" value="true" className={`${btn} bg-primary text-on-primary hover:bg-primary-dim`}>Grant</button>
          <button type="submit" name="granted" value="false" className={`${btn} bg-surface-container text-on-surface-variant hover:text-on-background`}>Revoke</button>
        </form>
        {grants.length > 0 ? (
          <ul className="mt-4 divide-y divide-outline-variant/20">
            {grants.map((g) => (
              <li key={g.userId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="font-sans text-sm text-on-background">{g.email}</span>
                <span className="flex flex-wrap gap-1.5">
                  {g.features.map((f) => (
                    <span key={f} className="rounded-md bg-primary/12 px-2 py-0.5 font-label text-[0.6rem] uppercase tracking-wide text-primary">
                      {USER_FEATURE_LABELS[f].label}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 font-sans text-xs text-on-surface-variant">No users have been granted extra features yet.</p>
        )}
      </section>

      {/* Startup workspace names (fix auto-derived names like "Gmail") */}
      {workspaces.length > 0 ? (
        <section className={card}>
          <h2 className="font-sans text-lg font-bold text-on-background">Workspaces</h2>
          <p className="mt-0.5 font-sans text-xs text-on-surface-variant">
            Rename a workspace (names auto-derived from an email address show up as e.g. “Gmail”).
          </p>
          <ul className="mt-4 space-y-2">
            {workspaces.map((w) => (
              <li key={w.id}>
                <form action={renameWorkspace} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input type="hidden" name="workspaceId" value={w.id} />
                  <input name="name" defaultValue={w.name} className={`${input} flex-1`} maxLength={80} />
                  <button type="submit" className={`${btn} bg-surface-container text-on-background hover:bg-surface-container-high`}>Rename</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Automation pointer */}
      <section className="rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-low p-5 md:p-6">
        <h2 className="font-sans text-lg font-bold text-on-background">Automation</h2>
        <p className="mt-1 font-sans text-sm text-on-surface-variant">
          Self-improvement, marketing autopilot, and competitor-discovery toggles live in the Automation console.
        </p>
        <Link href="/admin/automation" className="mt-3 inline-flex min-h-[36px] items-center gap-2 rounded-xl bg-surface-container px-4 text-sm font-semibold text-on-background transition hover:bg-surface-container-high">
          Open Automation
          <span className="material-symbols-outlined text-[16px]" aria-hidden>arrow_forward</span>
        </Link>
      </section>
    </div>
  );
}
