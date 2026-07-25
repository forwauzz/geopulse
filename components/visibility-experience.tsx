import Link from 'next/link';
import { AI_ENGINES, EngineLogo } from '@/components/ai-engines';
import type { AgencyPortfolioRow } from '@/lib/server/agency-portfolio';
import type { CustomerVisibilityView } from '@/lib/server/customer-visibility-view';

function hostInitial(domain: string | null, name: string): string {
  return (domain ?? name).replace(/^www\./, '').charAt(0).toUpperCase();
}

function statusCopy(status: CustomerVisibilityView['status']): { label: string; detail: string; icon: string } {
  if (status === 'measured') return { label: 'Baseline measured', detail: 'Your real blind buyer-question results are ready.', icon: 'verified' };
  if (status === 'failed') return { label: 'Measurement needs a retry', detail: 'Your setup is saved. We will retry without losing your prompts.', icon: 'refresh' };
  if (status === 'running') return { label: 'Checking AI answers now', detail: 'We are asking the prepared buyer questions across AI engines.', icon: 'progress_activity' };
  if (status === 'queued') return { label: 'First measurement queued', detail: 'Your prompts and competitors are ready. Results will appear after the first provider run.', icon: 'schedule' };
  return { label: 'Add a website to begin', detail: 'We need one domain to create your first visibility baseline.', icon: 'language' };
}

function VisibilityMeter({ value }: { readonly value: number | null }) {
  const bounded = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="relative grid h-40 w-40 place-items-center rounded-full p-3" style={{ background: `conic-gradient(var(--color-primary, #635bff) ${bounded * 3.6}deg, rgba(120,120,140,.14) 0deg)` }}>
      <div className="grid h-full w-full place-items-center rounded-full bg-surface-container-lowest text-center shadow-inner">
        <div>
          <p className="text-4xl font-bold text-on-background">{value === null ? '—' : `${Math.round(value)}%`}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{value === null ? 'Measuring' : 'Visibility'}</p>
        </div>
      </div>
    </div>
  );
}

export function CustomerVisibilityExperience({ view }: { readonly view: CustomerVisibilityView }) {
  const copy = statusCopy(view.status);
  const measuredByEngine = new Map(view.outcome.engines.map((row) => [row.engine, row]));
  return (
    <div className="mx-auto max-w-6xl space-y-7 py-4">
      <section className="relative overflow-hidden rounded-[2rem] border border-primary/15 bg-gradient-to-br from-[#17132c] via-[#302267] to-[#176c72] p-7 text-white shadow-2xl md:p-10">
        <div className="absolute -right-20 -top-24 h-80 w-80 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="absolute bottom-0 right-16 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15 text-2xl font-bold ring-1 ring-white/25">{hostInitial(view.domain, view.companyName)}</div>
              <div>
                <p className="text-sm font-semibold text-cyan-100">AI Visibility</p>
                <h1 className="font-headline text-3xl font-bold md:text-4xl">{view.companyName}</h1>
                <p className="mt-1 text-sm text-white/70">{view.domain ?? 'Website not connected'}</p>
              </div>
            </div>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-white/85">{view.outcome.executiveSummary}</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15">
              <span className="material-symbols-outlined text-[19px]" aria-hidden>{copy.icon}</span>
              {copy.label}
            </div>
          </div>
          <VisibilityMeter value={view.outcome.visibilityPct} />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ['travel_explore', 'Buyer prompts', view.prompts.length || '—', view.prompts.length ? 'Prepared for your category' : 'Waiting for setup'],
          ['compare_arrows', 'Competitors', view.competitors.length || '—', view.competitors.length ? 'Tracked automatically' : 'Discovery in progress'],
          ['fact_check', 'Website readiness', view.readinessScore === null ? '—' : `${view.readinessScore}/100`, view.readinessScore === null ? 'Run your first site audit' : 'Latest site audit'],
        ].map(([icon, label, value, detail]) => (
          <div key={String(label)} className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-float">
            <div className="flex items-center justify-between">
              <span className="material-symbols-outlined rounded-xl bg-primary/10 p-2 text-primary" aria-hidden>{icon}</span>
              <p className="text-3xl font-bold text-on-background">{value}</p>
            </div>
            <p className="mt-5 font-semibold text-on-background">{label}</p>
            <p className="mt-1 text-sm text-on-surface-variant">{detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-float">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Buyer demand</p>
              <h2 className="mt-2 font-headline text-xl font-semibold text-on-background">Questions that decide who gets recommended</h2>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Blind prompts</span>
          </div>
          {view.prompts.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {view.prompts.slice(0, 8).map((prompt, index) => (
                <div key={prompt} className="rounded-2xl bg-surface-container-low p-4">
                  <div className="flex gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-on-primary">{index + 1}</span>
                    <p className="text-sm font-medium leading-relaxed text-on-background">{prompt}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="mt-5 rounded-2xl border border-dashed border-outline-variant/30 p-6 text-sm text-on-surface-variant">{copy.detail}</p>}
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-float">
            <h2 className="font-headline text-lg font-semibold text-on-background">Answer engines</h2>
            <div className="mt-5 space-y-3">
              {AI_ENGINES.filter((engine) => engine.key === 'chatgpt' || engine.key === 'google').map((engine) => {
                const result = engine.key === 'google'
                  ? measuredByEngine.get('gemini')
                  : measuredByEngine.get('chatgpt');
                return (
                  <div key={engine.key} className="flex items-center gap-3 rounded-2xl bg-white p-3 text-slate-900 ring-1 ring-slate-200">
                    <EngineLogo engine={engine} className="h-8 w-8" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{engine.name}</p>
                      <p className="text-xs text-slate-500">{result ? 'Measured blind answers' : 'Included in baseline'}</p>
                    </div>
                    <p className="text-lg font-bold">{result ? `${Math.round(result.visibilityPct)}%` : '—'}</p>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-float">
            <h2 className="font-headline text-lg font-semibold text-on-background">Competitive set</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {view.competitors.length ? view.competitors.map((competitor) => (
                <span key={competitor} className="rounded-full bg-surface-container px-3 py-2 text-sm font-semibold text-on-background">{competitor}</span>
              )) : <p className="text-sm text-on-surface-variant">We will suggest competitors from your category data. You can refine them later.</p>}
            </div>
          </section>
        </div>
      </section>

      {!view.outcome.measured ? (
        <section className="rounded-3xl border border-primary/20 bg-primary/5 p-6">
          <div className="flex items-start gap-4">
            <span className="material-symbols-outlined mt-0.5 text-2xl text-primary" aria-hidden>{copy.icon}</span>
            <div><h2 className="font-semibold text-on-background">{copy.label}</h2><p className="mt-1 text-sm text-on-surface-variant">{copy.detail}</p></div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function AgencyVisibilityExperience({
  accountName,
  accountId,
  portfolio,
}: {
  readonly accountName: string;
  readonly accountId: string;
  readonly portfolio: readonly AgencyPortfolioRow[];
}) {
  const measured = portfolio.filter((row) => row.visibilityPct !== null);
  const average = measured.length ? measured.reduce((sum, row) => sum + row.visibilityPct!, 0) / measured.length : null;
  return (
    <div className="mx-auto max-w-6xl space-y-7 py-4">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-[#201647] via-[#512d78] to-[#bf4d62] p-8 text-white shadow-2xl">
        <div className="absolute right-8 top-4 text-[9rem] font-black leading-none text-white/5" aria-hidden>AI</div>
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-pink-100">Agency portfolio visibility</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
            <div><h1 className="font-headline text-3xl font-bold md:text-4xl">{accountName}</h1><p className="mt-2 max-w-2xl text-white/75">See which clients AI answer engines recommend, where competitors lead, and who needs action first.</p></div>
            <div className="rounded-2xl bg-white/10 px-6 py-4 text-right ring-1 ring-white/20"><p className="text-3xl font-bold">{average === null ? '—' : `${Math.round(average)}%`}</p><p className="text-xs text-white/70">Portfolio visibility</p></div>
          </div>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        {[['domain', 'Clients tracked', portfolio.length], ['verified', 'Measured', measured.length], ['schedule', 'Baselines in progress', portfolio.length - measured.length]].map(([icon, label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-float"><span className="material-symbols-outlined text-primary" aria-hidden>{icon}</span><p className="mt-5 text-3xl font-bold text-on-background">{value}</p><p className="text-sm text-on-surface-variant">{label}</p></div>
        ))}
      </section>
      <section>
        <div className="flex items-end justify-between gap-4"><div><h2 className="font-headline text-xl font-semibold text-on-background">Every client, one signal</h2><p className="mt-1 text-sm text-on-surface-variant">Real results appear as each blind baseline completes.</p></div><Link href={`/dashboard/clients?agencyAccount=${accountId}&manage=1`} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary">Add client</Link></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {portfolio.map((client) => (
            <Link key={client.clientId} href={`/dashboard/clients/${client.clientId}?agencyAccount=${accountId}`} className="group overflow-hidden rounded-3xl border border-outline-variant/10 bg-surface-container-lowest shadow-float transition hover:-translate-y-0.5 hover:border-primary/30">
              <div className="h-2 bg-gradient-to-r from-primary via-fuchsia-500 to-cyan-500" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-xl font-bold text-primary">{hostInitial(client.domain, client.clientName)}</div><div><h3 className="font-semibold text-on-background">{client.clientName}</h3><p className="text-sm text-on-surface-variant">{client.domain ?? 'Website needed'}</p></div></div><span className="material-symbols-outlined text-on-surface-variant transition group-hover:translate-x-1 group-hover:text-primary" aria-hidden>arrow_forward</span></div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-surface-container-low p-3"><p className="text-xs text-on-surface-variant">Visibility</p><p className="mt-1 text-xl font-bold text-on-background">{client.visibilityPct === null ? '—' : `${Math.round(client.visibilityPct)}%`}</p></div>
                  <div className="rounded-2xl bg-surface-container-low p-3"><p className="text-xs text-on-surface-variant">Readiness</p><p className="mt-1 text-xl font-bold text-on-background">{client.readinessScore ?? '—'}</p></div>
                  <div className="rounded-2xl bg-surface-container-low p-3"><p className="text-xs text-on-surface-variant">Status</p><p className="mt-1 truncate text-sm font-bold text-on-background">{client.visibilityPct === null ? 'Measuring' : 'Measured'}</p></div>
                </div>
                <div className="mt-4 rounded-2xl border border-outline-variant/10 p-3"><p className="text-xs text-on-surface-variant">Leading competitor</p><p className="mt-1 truncate text-sm font-semibold text-on-background">{client.leadingCompetitor ?? 'Baseline pending'}</p></div>
              </div>
            </Link>
          ))}
        </div>
        {!portfolio.length ? <div className="mt-5 rounded-3xl border border-dashed border-outline-variant/30 p-10 text-center"><h3 className="font-semibold text-on-background">Add your first client</h3><p className="mt-2 text-sm text-on-surface-variant">A business name and website are enough to prepare their AI visibility baseline.</p></div> : null}
      </section>
    </div>
  );
}
