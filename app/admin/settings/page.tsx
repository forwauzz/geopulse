import Link from 'next/link';
import { loadUiFlags, UI_FLAG_KEYS, UI_FLAG_LABELS, type UiFlagKey } from '@/lib/server/app-ui-flags';
import { setAppUiFlag } from './actions';

export const dynamic = 'force-dynamic';

// One submit button that flips a flag (matches the Automation console toggle style).
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
  const flags = await loadUiFlags();
  return (
    <div className="space-y-6">
      <header>
        <p className="font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Admin · App</p>
        <h1 className="mt-1 font-sans text-2xl font-black uppercase tracking-tight text-on-background">Settings</h1>
        <p className="mt-1 font-sans text-sm text-on-surface-variant">
          Show or hide whole sections of the app. Changes are live — no redeploy.
        </p>
      </header>

      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
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

      <section className="rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-low p-5 md:p-6">
        <h2 className="font-sans text-lg font-bold text-on-background">Automation</h2>
        <p className="mt-1 font-sans text-sm text-on-surface-variant">
          Self-improvement, marketing autopilot, and competitor-discovery toggles live in the
          Automation console.
        </p>
        <Link href="/admin/automation" className="mt-3 inline-flex min-h-[36px] items-center gap-2 rounded-xl bg-surface-container px-4 text-sm font-semibold text-on-background transition hover:bg-surface-container-high">
          Open Automation
          <span className="material-symbols-outlined text-[16px]" aria-hidden>arrow_forward</span>
        </Link>
      </section>
    </div>
  );
}
