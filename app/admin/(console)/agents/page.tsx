import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { loadAgentStatuses } from '@/lib/server/agent-console';
import { setAgentFlag } from './actions';

export const dynamic = 'force-dynamic';

function AudienceBadge({ audience }: { audience: 'internal' | 'client' }) {
  return audience === 'internal' ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-container-high px-2 py-0.5 font-label text-[0.62rem] font-bold uppercase tracking-widest text-on-surface-variant">
      <span className="material-symbols-outlined text-[13px]" aria-hidden>badge</span>
      Internal
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 font-label text-[0.62rem] font-bold uppercase tracking-widest text-sky-800 dark:bg-sky-500/15 dark:text-sky-200">
      <span className="material-symbols-outlined text-[13px]" aria-hidden>storefront</span>
      Client-facing
    </span>
  );
}

function StateDot({ enabled }: { enabled: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
      enabled ? 'bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-surface-container text-on-surface-variant'
    }`}>
      <span className={`h-2 w-2 rounded-full ${enabled ? 'bg-green-500' : 'bg-outline-variant'}`} />
      {enabled ? 'On' : 'Off'}
    </span>
  );
}

export default async function AdminAgentsPage() {
  const ctx = await loadAdminPageContext('/admin/agents');
  if (!ctx.ok) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">{ctx.message}</p>
      </main>
    );
  }

  const env = (await getScanApiEnv()) as unknown as Record<string, string | undefined>;
  const agents = await loadAgentStatuses(ctx.adminDb, env);
  const internal = agents.filter((a) => a.audience === 'internal');
  const client = agents.filter((a) => a.audience === 'client');

  const renderAgent = (a: (typeof agents)[number]) => (
    <div key={a.key} className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-sans text-sm font-bold text-on-background">{a.name}</p>
        <AudienceBadge audience={a.audience} />
        <span className="ml-auto"><StateDot enabled={a.enabled} /></span>
      </div>
      <p className="mt-1 font-sans text-sm leading-6 text-on-surface-variant">{a.description}</p>

      {a.blockers.length > 0 && (
        <ul className="mt-2 space-y-1">
          {a.blockers.map((b) => (
            <li key={b} className="flex items-start gap-1.5 font-sans text-xs text-amber-700 dark:text-amber-300">
              <span className="material-symbols-outlined mt-0.5 text-[13px]" aria-hidden>warning</span>
              {b}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {a.control === 'flag' && a.flagFeature ? (
          <>
            <form action={setAgentFlag}>
              <input type="hidden" name="feature" value={a.flagFeature} />
              <input type="hidden" name="field" value="enabled" />
              <input type="hidden" name="value" value={a.enabled ? 'false' : 'true'} />
              <button
                type="submit"
                className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-on-primary transition hover:opacity-90"
              >
                Turn {a.enabled ? 'off' : 'on'}
              </button>
            </form>
            <form action={setAgentFlag}>
              <input type="hidden" name="feature" value={a.flagFeature} />
              <input type="hidden" name="field" value="kill_switch" />
              <input type="hidden" name="value" value={a.killSwitch ? 'false' : 'true'} />
              <button
                type="submit"
                className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${
                  a.killSwitch
                    ? 'border-error/40 bg-error/10 text-error'
                    : 'border-outline-variant/30 text-on-background hover:bg-surface-container-lowest'
                }`}
              >
                {a.killSwitch ? 'Kill switch ON — release' : 'Kill switch'}
              </button>
            </form>
          </>
        ) : (
          <span className="font-sans text-xs text-on-surface-variant">
            {a.control === 'env'
              ? 'Switched via wrangler.jsonc (redeploy).'
              : a.control === 'grants'
                ? 'Client-controlled; admin manages access per user.'
                : 'Managed in its own console.'}
          </span>
        )}
        {a.manageHint && <span className="font-sans text-xs text-on-surface-variant/80">{a.manageHint}</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Admin</p>
        <h1 className="mt-1 font-sans text-2xl font-black uppercase tracking-tight text-on-background">Agents</h1>
        <p className="mt-1 max-w-2xl font-sans text-sm text-on-surface-variant">
          Every agent in the product: what it does, whether it is running, what blocks it, and its
          switch. Flag toggles apply on the next run — no redeploy.
        </p>
      </header>

      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <h2 className="font-sans text-lg font-bold text-on-background">Internal — works for us</h2>
        <div className="mt-3 space-y-3">{internal.map(renderAgent)}</div>
      </section>

      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <h2 className="font-sans text-lg font-bold text-on-background">Client-facing — works for them</h2>
        <div className="mt-3 space-y-3">{client.map(renderAgent)}</div>
      </section>
    </div>
  );
}
