import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CitationEvidencePanel } from '@/components/citation-evidence-panel';
import { ClientScorecardShareControls } from '@/components/client-scorecard-share-controls';
import { TrackedPromptsPanel } from '@/components/tracked-prompts-panel';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCitationEvidence } from '@/lib/server/citation-evidence';
import { loadEngineCitationMetrics, type EngineKey } from '@/lib/server/dashboard-citation-metrics';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';
import { getTrackedPromptPanel } from '@/lib/server/tracked-prompts';
import { loadClientOutcomeEngine } from '@/lib/server/client-outcome-engine';
import { activateClientMonitoring, completeClientBaseline, createClientShareLink, importClientPromptCsv, runClientVisibilityCheck, saveClientMonitoring, updateOutcomeActionStatus } from './actions';
import { PendingSubmitButton } from '@/components/pending-submit-button';
import { recipientsFromMetadata } from '@/lib/shared/report-recipients';
import { isClientReportSharingHeld, isReportQuarantined } from '@/lib/server/report-quarantine';
import type { ClientMeasurementScope } from '@/lib/server/client-measurement-scope';

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
  readonly searchParams?: Promise<{ agencyAccount?: string; prompt?: string; monitoring?: string; visibility?: string; share?: string; promptImport?: string; baseline?: string }>;
}) {
  const [{ clientId }, sp] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { agencyAccount?: string; prompt?: string; monitoring?: string; visibility?: string; share?: string; promptImport?: string; baseline?: string }),
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
  const { data: clientIdentity } = await admin
    .from('agency_clients')
    .select('metadata')
    .eq('id', clientId)
    .eq('agency_account_id', account.id)
    .maybeSingle();
  const clientMetadata = clientIdentity?.metadata && typeof clientIdentity.metadata === 'object'
    ? clientIdentity.metadata as Record<string, unknown>
    : {};
  const reportSharingHeld = isClientReportSharingHeld(clientMetadata);
  const shareToken = !reportSharingHeld && typeof clientMetadata['client_summary_share_token'] === 'string'
    ? String(clientMetadata['client_summary_share_token'])
    : null;
  const publicSummaryUrl = shareToken
    ? `https://getgeopulse.com/client-summary/${client.id}?share=${shareToken}`
    : null;
  const latestScan = data.scans.find((scan) => scan.agencyClientId === clientId) ?? null;
  const previousScan = latestScan
    ? data.scans.find((scan) => scan.agencyClientId === clientId && scan.id !== latestScan.id) ?? null
    : null;
  const domain = client.canonicalDomain ?? latestScan?.domain ?? null;

  const configResult = domain
    ? await admin
        .from('benchmark_domains')
        .select('id')
        .eq('canonical_domain', domain.replace(/^www\./, '').toLowerCase())
        .maybeSingle()
    : { data: null };

  let competitors: string[] = [];
  let configId: string | null = null;
  let cadence: string | null = null;
  let reportEmail: string | null = null;
  let configMetadata: Record<string, unknown> = {};
  let platformsEnabled: string[] = [];
  let querySetId: string | null = null;
  if (configResult.data?.id) {
    const { data: config } = await admin
      .from('client_benchmark_configs')
      .select('id,query_set_id,competitor_list,cadence,report_email,metadata,platforms_enabled')
      .eq('agency_account_id', account.id)
      .eq('benchmark_domain_id', configResult.data.id)
      .maybeSingle();
    competitors = Array.isArray(config?.competitor_list) ? config.competitor_list : [];
    configId = typeof config?.id === 'string' ? config.id : null;
    cadence = typeof config?.cadence === 'string' ? config.cadence : null;
    reportEmail = typeof config?.report_email === 'string' ? config.report_email : null;
    configMetadata = config?.metadata && typeof config.metadata === 'object'
      ? config.metadata as Record<string, unknown>
      : {};
    platformsEnabled = Array.isArray(config?.platforms_enabled) ? config.platforms_enabled : [];
    querySetId = typeof config?.query_set_id === 'string' ? config.query_set_id : null;
  }
  const measurementScope: ClientMeasurementScope | undefined = querySetId
    ? { querySetId, agencyAccountId: account.id, enabledPlatforms: platformsEnabled }
    : undefined;
  const [engines, prompts, evidence] = domain && measurementScope
    ? await Promise.all([
        loadEngineCitationMetrics({ supabase: admin, domain, measurementScope }),
        getTrackedPromptPanel({ supabase: admin, domain, measurementScope }),
        getCitationEvidence({ supabase: admin, domain, measurementScope }),
      ])
    : [{}, null, []] as const;

  const { data: latestScanDetail } = latestScan
    ? await admin
        .from('scans')
        .select('issues_json,full_results_json')
        .eq('id', latestScan.id)
        .maybeSingle()
    : { data: null };
  const outcome = domain
    ? await loadClientOutcomeEngine({
        supabase: admin,
        domain,
        configMetadata,
        latestScan: latestScanDetail,
        measurementScope,
      })
    : null;
  const { data: currentRunGroups } = configId && querySetId
    ? await admin
        .from('benchmark_run_groups')
        .select('id')
        .eq('query_set_id', querySetId)
        .eq('agency_account_id', account.id)
        .eq('metadata->>domain_id', configResult.data?.id ?? '')
        .order('started_at', { ascending: false })
        .limit(80)
    : { data: null };
  const currentRunGroupIds = (currentRunGroups ?? []).map((row: { id: string }) => row.id);
  const { data: storedGpmReports } = configId && currentRunGroupIds.length > 0
    ? await admin
        .from('gpm_reports')
        .select('id,pdf_url,generated_at,platform,metadata')
        .eq('config_id', configId)
        .in('run_group_id', currentRunGroupIds)
        .order('generated_at', { ascending: false })
        .limit(24)
    : { data: null };
  const gpmReports = (storedGpmReports ?? [])
    .filter((report: { metadata: Record<string, unknown> | null }) => !isReportQuarantined(report.metadata))
    .slice(0, 6);
  const engineEntries = (Object.entries(engines) as Array<[EngineKey, { citationRate: number }]>);
  const reportRecipients = recipientsFromMetadata(reportEmail, configMetadata);
  const latestGpmReport = gpmReports?.[0] ?? null;
  const baselineStatus = typeof configMetadata['onboarding_loop_status'] === 'string'
    ? String(configMetadata['onboarding_loop_status'])
    : typeof configMetadata['baseline_status'] === 'string'
      ? String(configMetadata['baseline_status'])
      : 'not_started';
  const estimatedSpend = Number(configMetadata['spend_estimated_usd'] ?? 0);
  const monthSpend = Number(configMetadata['spend_month_to_date_usd'] ?? 0);
  const monthlyCap = Number(configMetadata['spend_monthly_cap_usd'] ?? 5);
  const enabledPlatformLabels = platformsEnabled
    .map((platform) => ENGINE_LABEL[platform as EngineKey] ?? platform)
    .join(', ');
  const latestReportMetadata = latestGpmReport?.metadata && typeof latestGpmReport.metadata === 'object'
    ? latestGpmReport.metadata as Record<string, unknown>
    : {};
  const latestReportEmailStatus = String(latestReportMetadata['email_status'] ?? 'generated');
  const latestReportHeld = reportSharingHeld || latestReportEmailStatus.startsWith('held_')
    || latestReportMetadata['delivery_blocked'] === true;

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
            <Link href={`/dashboard/clients/${client.id}/report-profile`} className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-4 py-2.5 text-sm font-semibold text-on-background">
              <span className="material-symbols-outlined text-[18px]" aria-hidden>tune</span> Report profile
            </Link>
            <Link href={`/dashboard/new-scan?agencyAccount=${account.id}&agencyClient=${client.id}&url=${encodeURIComponent(domain ? `https://${domain}` : '')}`} className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-4 py-2.5 text-sm font-semibold text-on-background">
              <span className="material-symbols-outlined text-[18px]" aria-hidden>refresh</span> Check again
            </Link>
            {publicSummaryUrl ? <Link href={publicSummaryUrl} target="_blank" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary"><span className="material-symbols-outlined text-[18px]" aria-hidden>share</span> Open client scorecard</Link> : null}
            {!shareToken && !reportSharingHeld ? (
              <form action={createClientShareLink}>
                <input type="hidden" name="clientId" value={client.id} />
                <input type="hidden" name="agencyAccountId" value={account.id} />
                <button className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-4 py-2.5 text-sm font-semibold text-on-background">
                  <span className="material-symbols-outlined text-[18px]" aria-hidden>ios_share</span>
                  Create client scorecard
                </button>
              </form>
            ) : null}
          </div>
        </div>
        {publicSummaryUrl ? (
          <div className="mt-4 rounded-xl bg-surface-container-low px-4 py-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
              Customer-ready scorecard
            </p>
            <ClientScorecardShareControls summaryUrl={publicSummaryUrl} />
          </div>
        ) : null}
        {reportSharingHeld ? (
          <div className="mt-4 rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
            Client sharing is held for review. Nothing here can be opened publicly or emailed until the review is released.
          </div>
        ) : null}
        <div className="mt-4 rounded-2xl border border-outline-variant/15 bg-surface-container-lowest p-5 shadow-float">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Automatic customer baseline</p>
              <p className="mt-1 font-semibold text-on-background">
                {baselineStatus === 'closed' || baselineStatus === 'measured'
                  ? 'Research, audit, AI measurement, and scorecard are active'
                  : 'Complete the first client-ready baseline'}
              </p>
              <p className="mt-1 text-sm text-on-surface-variant">
                10 buyer questions · 3–5 researched competitors · {enabledPlatformLabels || 'AI measurement pending'} · recurring {cadence ?? 'monthly'}
              </p>
              <p className="mt-2 text-xs text-on-surface-variant">
                Spend guard: {estimatedSpend > 0 ? `$${estimatedSpend.toFixed(2)} estimated` : 'estimated before launch'}
                {' · '}${monthSpend.toFixed(2)} of ${monthlyCap.toFixed(2)} monthly cap
              </p>
            </div>
            <form action={completeClientBaseline}>
              <input type="hidden" name="clientId" value={client.id} />
              <input type="hidden" name="agencyAccountId" value={account.id} />
              <input type="hidden" name="reportEmail" value={reportRecipients[0] ?? user.email ?? ''} />
              <PendingSubmitButton
                idleLabel={baselineStatus === 'closed' || baselineStatus === 'measured' ? 'Verify baseline' : 'Complete baseline'}
                pendingLabel="Researching and measuring…"
                className="inline-flex items-center gap-2 rounded-xl bg-on-background px-4 py-2.5 text-sm font-semibold text-background"
              />
            </form>
          </div>
          {sp.baseline ? (
            <p className={`mt-3 text-sm font-medium ${sp.baseline === 'complete' ? 'text-primary' : 'text-error'}`}>
              {sp.baseline === 'complete'
                ? 'Baseline complete and recurring monitoring scheduled.'
                : `Baseline needs attention: ${sp.baseline.replaceAll('_', ' ')}.`}
            </p>
          ) : null}
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

      {outcome ? (
        <section className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-float">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">What changed</p>
              <h2 className="mt-2 font-headline text-xl font-semibold text-on-background">Outcome summary</h2>
              <p className="mt-2 leading-relaxed text-on-surface-variant">{outcome.executiveSummary}</p>
            </div>
            {outcome.measured ? (
              <div className="rounded-xl bg-surface-container-low px-5 py-4 text-right">
                <p className="text-xs text-on-surface-variant">AI visibility</p>
                <p className="mt-1 text-3xl font-bold text-on-background">{outcome.visibilityPct}%</p>
                <p className={`mt-1 text-xs font-semibold ${outcome.trend === 'regressed' ? 'text-error' : 'text-primary'}`}>
                  {outcome.deltaPct === null ? 'Baseline' : `${outcome.deltaPct > 0 ? '+' : ''}${outcome.deltaPct} points`}
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">Baseline pending</div>
            )}
          </div>
          {outcome.engines.length > 0 ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {outcome.engines.map((item) => (
                <div key={item.engine} className="rounded-xl bg-surface-container-low p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-on-background">{ENGINE_LABEL[item.engine]}</p>
                    <p className="text-xl font-bold text-on-background">{item.visibilityPct}%</p>
                  </div>
                  <p className="mt-2 text-xs text-on-surface-variant">
                    {item.modelId} · {item.measuredAt ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.measuredAt)) : 'Time unavailable'}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          {latestScan?.score !== null && latestScan?.score !== undefined ? (
            <div className="mt-3 rounded-xl border border-outline-variant/15 px-4 py-3 text-sm text-on-surface-variant">
              Website audit: <span className="font-semibold text-on-background">{latestScan.score}/100</span>
              {previousScan?.score !== null && previousScan?.score !== undefined
                ? ` · ${latestScan.score - previousScan.score >= 0 ? '+' : ''}${latestScan.score - previousScan.score} points since the previous recheck`
                : ' · first versioned baseline'}
            </div>
          ) : null}
          <details className="mt-4 text-xs text-on-surface-variant">
            <summary className="cursor-pointer font-semibold text-on-background">How this is measured</summary>
            <p className="mt-2 max-w-3xl leading-relaxed">{outcome.methodology}</p>
          </details>
          {configId ? (
            <form action={runClientVisibilityCheck} className="mt-5 flex flex-wrap items-center gap-3">
              <input type="hidden" name="clientId" value={client.id} />
              <input type="hidden" name="agencyAccountId" value={account.id} />
              <input type="hidden" name="configId" value={configId} />
              <PendingSubmitButton
                idleLabel="Check visibility now"
                pendingLabel="Checking ChatGPT + Gemini…"
                className="inline-flex items-center gap-2 rounded-xl bg-on-background px-4 py-2.5 text-sm font-semibold text-background"
              />
              {sp.visibility ? (
                <span className={`text-sm font-medium ${sp.visibility === 'checked' ? 'text-primary' : 'text-error'}`}>
                  {sp.visibility === 'checked' ? 'New measurement saved' : sp.visibility === 'not_enabled' ? 'Monitoring is not included in this plan' : 'Check did not complete'}
                </span>
              ) : null}
            </form>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
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
                <label className="text-sm text-on-surface-variant sm:col-span-2">Recipients
                  <textarea name="reportEmail" defaultValue={reportRecipients.join('\n')} rows={3} placeholder={'client@company.com\njack@lifter.ca'} className="mt-1 w-full resize-y rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-on-background" />
                  <span className="mt-1 block text-xs leading-relaxed">Up to 5 emails, one per line. Add the client, agency owner, and website manager here.</span>
                </label>
              </div>
              <label className="block text-sm text-on-surface-variant">Competitors <span className="text-xs">(one per line)</span>
                <textarea name="competitorList" defaultValue={competitors.join('\n')} rows={3} className="mt-1 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-on-background" />
              </label>
              <div className="flex items-center gap-3">
                <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">Save delivery</button>
                {sp.monitoring === 'saved' || sp.monitoring === 'activated' ? <span className="text-sm font-medium text-primary">{sp.monitoring === 'activated' ? 'Tracking started' : 'Saved'}</span> : null}
              </div>
              <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low px-4 py-3 text-xs leading-relaxed text-on-surface-variant">
                <p><strong className="text-on-background">Delivery:</strong> {reportSharingHeld ? 'held for review; no client email or public link is available.' : 'sent from reports@getgeopulse.com with your saved agency branding. Replies use your agency reply-to email when configured.'}</p>
                <p className="mt-1">Tracking: {platformsEnabled.map((platform) => platform === 'chatgpt' ? 'ChatGPT' : platform === 'gemini' ? 'Gemini' : platform).join(' + ') || 'Not configured'}</p>
              </div>
              <div className="rounded-xl bg-surface-container-low p-3 text-sm">
                {latestGpmReport ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-on-background">Latest report ready</p>
                      <p className="mt-0.5 text-xs text-on-surface-variant">
                        {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(latestGpmReport.generated_at))} · {ENGINE_LABEL[String(latestGpmReport.platform) as EngineKey] ?? String(latestGpmReport.platform)}
                      </p>
                    </div>
                    {latestGpmReport.pdf_url ? <Link href={latestGpmReport.pdf_url} target="_blank" className="font-semibold text-primary hover:underline">Preview PDF</Link> : <span className="text-xs text-on-surface-variant">{latestReportHeld ? 'Held for review' : latestReportEmailStatus === 'sent' ? 'Sent by email' : 'Generated'}</span>}
                  </div>
                ) : <p className="text-on-surface-variant">The first report will appear after a visibility check.</p>}
                {(gpmReports ?? []).length > 0 ? (
                  <details className="mt-3 border-t border-outline-variant/15 pt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-on-background">Delivery history ({gpmReports!.length})</summary>
                    <div className="mt-2 space-y-2">
                      {gpmReports!.map((report: {
                        id: string;
                        platform: string;
                        generated_at: string;
                        metadata: Record<string, unknown> | null;
                      }) => {
                        const metadata = report.metadata && typeof report.metadata === 'object'
                          ? report.metadata as Record<string, unknown>
                          : {};
                        const status = String(metadata['email_status'] ?? 'generated').replaceAll('_', ' ');
                        return (
                          <div key={report.id} className="flex items-center justify-between gap-3 text-xs text-on-surface-variant">
                            <span className="capitalize">{String(report.platform) === 'chatgpt' ? 'ChatGPT' : String(report.platform)} · {status}</span>
                            <span>{new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(report.generated_at))}</span>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ) : null}
              </div>
            </form>
          ) : (
            <form action={activateClientMonitoring} className="mt-5 space-y-3">
              <input type="hidden" name="clientId" value={client.id} />
              <input type="hidden" name="agencyAccountId" value={account.id} />
              <input type="hidden" name="domain" value={domain ?? ''} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-on-surface-variant">What the client sells
                  <input name="topic" required placeholder="Vestibular physiotherapy" defaultValue={client.vertical ?? ''} className="mt-1 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-on-background" />
                </label>
                <label className="text-sm text-on-surface-variant">Market
                  <input name="location" required placeholder="Vancouver, BC" className="mt-1 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-on-background" />
                </label>
              </div>
              <label className="block text-sm text-on-surface-variant">Buyer questions <span className="text-xs">(one per line)</span>
                <textarea name="prompts" required rows={6} placeholder={'best vestibular therapy in Vancouver\nwhere can I get vertigo treatment in Vancouver?'} className="mt-1 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-on-background" />
              </label>
              <label className="block text-sm text-on-surface-variant">Competitors <span className="text-xs">(optional, one per line)</span>
                <textarea name="competitorList" rows={3} className="mt-1 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-on-background" />
              </label>
              <label className="block text-sm text-on-surface-variant">Send reports to
                <textarea name="reportEmail" required rows={3} defaultValue={user.email ?? ''} className="mt-1 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-on-background" />
                <span className="mt-1 block text-xs">Up to 5 emails, one per line.</span>
              </label>
              <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary">
                <span className="material-symbols-outlined text-[18px]" aria-hidden>monitoring</span> Start tracking
              </button>
              <p className="text-xs leading-relaxed text-on-surface-variant">Uses ChatGPT, Gemini, and Perplexity. The first complete measurement becomes the baseline; later checks show improvement or regression.</p>
            </form>
          )}
        </div>
      </section>

      {outcome && outcome.actions.length > 0 ? (
        <section id="actions" className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-float">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Recommended next</p>
              <h2 className="mt-2 font-headline text-xl font-semibold text-on-background">Prioritized actions</h2>
              <p className="mt-1 text-sm text-on-surface-variant">High-impact work first. Marking an item done keeps an audit trail.</p>
            </div>
            <span className="material-symbols-outlined text-primary" aria-hidden>task_alt</span>
          </div>
          <div className="mt-5 divide-y divide-outline-variant/15">
            {outcome.actions.map((action) => (
              <article key={action.key} className="grid gap-3 py-4 md:grid-cols-[1fr_auto] md:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={`font-semibold ${action.status === 'completed' ? 'text-on-surface-variant line-through' : 'text-on-background'}`}>{action.title}</h3>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">{action.impact} impact</span>
                    <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{action.effort} effort</span>
                  </div>
                  <p className="mt-2 text-sm text-on-surface-variant">{action.why}</p>
                  <p className="mt-1 text-sm font-medium text-on-background">Next step: {action.nextStep}</p>
                  {action.completedAt ? <p className="mt-1 text-xs text-on-surface-variant">Completed {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(action.completedAt))}</p> : null}
                </div>
                {configId ? (
                  <form action={updateOutcomeActionStatus}>
                    <input type="hidden" name="clientId" value={client.id} />
                    <input type="hidden" name="agencyAccountId" value={account.id} />
                    <input type="hidden" name="configId" value={configId} />
                    <input type="hidden" name="actionKey" value={action.key} />
                    <input type="hidden" name="status" value={action.status === 'completed' ? 'pending' : 'completed'} />
                    <button className={`rounded-xl px-3 py-2 text-sm font-semibold ${action.status === 'completed' ? 'border border-outline-variant/20 text-on-background' : 'bg-on-background text-background'}`}>
                      {action.status === 'completed' ? 'Reopen' : 'Mark done'}
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {prompts?.tracked && domain ? <TrackedPromptsPanel panel={prompts} domain={domain} statusCode={sp.prompt} /> : (
        <section className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">Customer questions</h2>
          <p className="mt-2 text-sm text-on-surface-variant">These are the questions potential customers ask ChatGPT and other AI engines. They appear after visibility tracking starts.</p>
        </section>
      )}
      {configId ? (
        <section className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-float">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-headline text-lg font-semibold text-on-background">Import customer questions</h2>
              <p className="mt-1 text-sm text-on-surface-variant">Upload a CSV with a Prompt, Query, Question, or Keyword column. Existing questions are kept.</p>
            </div>
            <form action={importClientPromptCsv} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="clientId" value={client.id} />
              <input type="hidden" name="agencyAccountId" value={account.id} />
              <input type="hidden" name="configId" value={configId} />
              <input name="promptCsv" type="file" accept=".csv,text/csv" required className="max-w-[220px] text-sm text-on-surface-variant file:mr-2 file:rounded-lg file:border-0 file:bg-surface-container file:px-3 file:py-2 file:font-semibold" />
              <button className="rounded-xl bg-on-background px-4 py-2 text-sm font-semibold text-background">Import CSV</button>
            </form>
          </div>
          {sp.promptImport ? <p className={`mt-3 text-sm font-medium ${sp.promptImport === 'imported' ? 'text-primary' : 'text-error'}`}>{sp.promptImport === 'imported' ? 'Questions imported' : 'No valid questions found in that file'}</p> : null}
        </section>
      ) : null}
      {evidence.length > 0 && domain ? <CitationEvidencePanel evidence={evidence} domain={domain} /> : null}
    </div>
  );
}
