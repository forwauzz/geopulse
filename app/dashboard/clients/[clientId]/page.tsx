import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CitationEvidencePanel } from '@/components/citation-evidence-panel';
import { TrackedPromptsPanel } from '@/components/tracked-prompts-panel';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCitationEvidence } from '@/lib/server/citation-evidence';
import { loadEngineCitationMetrics, type EngineKey } from '@/lib/server/dashboard-citation-metrics';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';
import { getTrackedPromptPanel } from '@/lib/server/tracked-prompts';
import { saveClientMonitoring } from './actions';

export const dynamic = 'force-dynamic';

const ENGINE_LABEL: Record<EngineKey, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  claude: 'Claude',
};

export default async function ClientScorecardPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ clientId: string }>;
  readonly searchParams?: Promise<{ agencyAccount?: string; prompt?: string; monitoring?: string }>;
}) {
  const [{ clientId }, sp] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { agencyAccount?: string; prompt?: string; monitoring?: string }),
  ]);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/clients/${clientId}`);

  const workspace = await loadCurrentAgencyWorkspace({
    userId: user.id,
    supabase,
    selectedAccountId: sp.agencyAccount,
    selectedClientId: clientId,
  });
  if (!workspace || workspace.data.selectedClientId !== clientId) notFound();
  const { data, admin } = workspace;
  const account = data.accounts.find((item) => item.id === data.selectedAccountId)!;
  const client = account.clients.find((item) => item.id === clientId)!;
  const latestScan = data.scans.find((scan) => scan.agencyClientId === clientId) ?? null;
  const domain = client.canonicalDomain ?? latestScan?.domain ?? null;

  const [engines, prompts, evidence, configResult] = domain
    ? await Promise.all([
        loadEngineCitationMetrics({ supabase: admin, domain }),
        getTrackedPromptPanel({ supabase: admin, domain }),
        getCitationEvidence({ supabase: admin, domain }),
        admin
          .from('benchmark_domains')
          .select('id')
          .eq('canonical_domain', domain.replace(/^www\./, '').toLowerCase())
          .maybeSingle(),
      ])
    : [{}, null, [], { data: null }] as const;

  let competitors: string[] = [];
  let configId: string | null = null;
  let cadence: string | null = null;
  let reportEmail: string | null = null;
  if (configResult.data?.id) {
    const { data: config } = await admin
      .from('client_benchmark_configs')
      .select('id,competitor_list,cadence,report_email')
      .eq('agency_account_id', account.id)
      .eq('benchmark_domain_id', configResult.data.id)
      .maybeSingle();
    competitors = Array.isArray(config?.competitor_list) ? config.competitor_list : [];
    configId = typeof config?.id === 'string' ? config.id : null;
    cadence = typeof config?.cadence === 'string' ? config.cadence : null;
    reportEmail = typeof config?.report_email === 'string' ? config.report_email : null;
  }

  const engineEntries = (Object.entries(engines) as Array<[EngineKey, { citationRate: number }]>);

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-4">
      <header>
        <Link href="/dashboard/clients" className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-background">
          <span className="material-symbols-outlined text-[17px]" aria-hidden>arrow_back</span> Clients
        </Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Client scorecard</p>
            <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">{client.name}</h1>
            <p className="mt-1 text-on-surface-variant">{domain ?? 'Website not set'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/new-scan?agencyAccount=${account.id}&agencyClient=${client.id}&url=${encodeURIComponent(domain ? `https://${domain}` : '')}`} className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-4 py-2.5 text-sm font-semibold text-on-background">
              <span className="material-symbols-outlined text-[18px]" aria-hidden>refresh</span> Check again
            </Link>
            {latestScan ? <Link href={`/results/${latestScan.id}/report`} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary"><span className="material-symbols-outlined text-[18px]" aria-hidden>share</span> Share report</Link> : null}
          </div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_2fr]">
        <div className="rounded-2xl bg-on-background p-6 text-background shadow-float">
          <p className="text-sm opacity-70">AI readiness score</p>
          <p className="mt-5 text-6xl font-bold">{latestScan?.score ?? '—'}{latestScan?.score !== null && latestScan?.score !== undefined ? <span className="text-lg font-normal opacity-60">/100</span> : null}</p>
          <p className="mt-5 text-sm opacity-70">{latestScan ? `Last checked ${new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(latestScan.createdAt))}` : 'Run the first check to establish a baseline.'}</p>
        </div>
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">How often AI recommends this client</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Measured from real buyer questions where the brand is not named.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(['chatgpt', 'gemini', 'perplexity', 'claude'] as EngineKey[]).map((engine) => (
              <div key={engine} className="rounded-xl bg-surface-container-low p-4">
                <p className="text-sm font-medium text-on-background">{ENGINE_LABEL[engine]}</p>
                <p className="mt-3 text-2xl font-bold text-on-background">{engines[engine] ? `${Math.round(engines[engine]!.citationRate * 100)}%` : '—'}</p>
              </div>
            ))}
          </div>
          {engineEntries.length === 0 ? <p className="mt-4 text-xs text-on-surface-variant">AI visibility tracking starts after this domain is enrolled in monitoring.</p> : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-float">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="font-headline text-lg font-semibold text-on-background">Visibility vs competitors</h2><p className="mt-1 text-sm text-on-surface-variant">Brands tracked in the same buyer questions.</p></div>
            <span className="material-symbols-outlined text-primary" aria-hidden>compare_arrows</span>
          </div>
          {competitors.length > 0 ? <ul className="mt-5 space-y-2">{competitors.map((name) => <li key={name} className="rounded-xl bg-surface-container-low px-4 py-3 text-sm font-medium text-on-background">{name}</li>)}</ul> : <p className="mt-5 rounded-xl bg-surface-container-low p-4 text-sm text-on-surface-variant">No competitors selected yet. Add them when AI visibility monitoring is configured.</p>}
        </div>
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-float">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="font-headline text-lg font-semibold text-on-background">Recurring client report</h2><p className="mt-1 text-sm text-on-surface-variant">A presentation-ready update, delivered automatically.</p></div>
            <span className="material-symbols-outlined text-primary" aria-hidden>schedule_send</span>
          </div>
          {configId ? (
            <form action={saveClientMonitoring} className="mt-5 space-y-3">
              <input type="hidden" name="clientId" value={client.id} />
              <input type="hidden" name="agencyAccountId" value={account.id} />
              <input type="hidden" name="configId" value={configId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-on-surface-variant">Schedule
                  <select name="cadence" defaultValue={cadence ?? 'monthly'} className="mt-1 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-on-background">
                    <option value="monthly">Monthly</option><option value="biweekly">Every two weeks</option><option value="weekly">Weekly</option>
                  </select>
                </label>
                <label className="text-sm text-on-surface-variant">Send to
                  <input name="reportEmail" type="email" defaultValue={reportEmail ?? ''} placeholder="client@company.com" className="mt-1 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-on-background" />
                </label>
              </div>
              <label className="block text-sm text-on-surface-variant">Competitors <span className="text-xs">(one per line)</span>
                <textarea name="competitorList" defaultValue={competitors.join('\n')} rows={3} className="mt-1 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-on-background" />
              </label>
              <div className="flex items-center gap-3">
                <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">Save delivery</button>
                {sp.monitoring === 'saved' ? <span className="text-sm font-medium text-primary">Saved</span> : null}
              </div>
            </form>
          ) : (
            <div className="mt-5">
              <p className="rounded-xl bg-surface-container-low p-4 text-sm text-on-surface-variant">AI visibility monitoring is not active for this client yet.</p>
              <Link href="/pricing?bundle=agency_core" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Activate monitoring <span className="material-symbols-outlined text-[16px]" aria-hidden>arrow_forward</span></Link>
            </div>
          )}
        </div>
      </section>

      {prompts?.tracked && domain ? <TrackedPromptsPanel panel={prompts} domain={domain} statusCode={sp.prompt} /> : (
        <section className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">Customer questions</h2>
          <p className="mt-2 text-sm text-on-surface-variant">These are the questions potential customers ask ChatGPT and other AI engines. They appear after visibility tracking starts.</p>
        </section>
      )}
      {evidence.length > 0 && domain ? <CitationEvidencePanel evidence={evidence} domain={domain} /> : null}
    </div>
  );
}
