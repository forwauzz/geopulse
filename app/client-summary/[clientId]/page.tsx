import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { loadClientOutcomeEngine } from '@/lib/server/client-outcome-engine';
import { getTrackedPromptPanel } from '@/lib/server/tracked-prompts';
import { getBrandSettingsView, resolveReportFilesPublicBase } from '@/lib/server/report-branding-settings';

export const dynamic = 'force-dynamic';

function changeLabel(value: number | null): string {
  if (value === null) return 'First baseline';
  if (value === 0) return 'No change';
  return `${value > 0 ? '+' : ''}${Math.round(value * 10) / 10} points`;
}

export default async function ClientSummaryPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ clientId: string }>;
  readonly searchParams: Promise<{ share?: string }>;
}) {
  const [{ clientId }, sp, env] = await Promise.all([params, searchParams, getScanApiEnv()]);
  if (!sp.share || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) notFound();
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: client } = await admin
    .from('agency_clients')
    .select('id,agency_account_id,name,display_name,canonical_domain,vertical,metadata,agency_accounts(name,website_domain,metadata)')
    .eq('id', clientId)
    .maybeSingle();
  if (!client?.metadata || typeof client.metadata !== 'object') notFound();
  const metadata = client.metadata as Record<string, unknown>;
  if (metadata['client_summary_share_token'] !== sp.share) notFound();

  const domain = typeof client.canonical_domain === 'string' ? client.canonical_domain : null;
  if (!domain) notFound();
  const accountRaw = Array.isArray(client.agency_accounts) ? client.agency_accounts[0] : client.agency_accounts;
  const account = (accountRaw ?? {}) as Record<string, unknown>;
  const brand = await getBrandSettingsView({
    supabase: admin as never,
    scope: { table: 'agency_accounts', id: client.agency_account_id },
    publicBase: await resolveReportFilesPublicBase(),
  }).catch(() => null);
  const agencyName = brand?.companyName || (typeof account['name'] === 'string' ? account['name'] : 'Your marketing partner');

  const { data: scans } = await admin
    .from('scans')
    .select('id,score,letter_grade,created_at,issues_json,full_results_json')
    .or(`agency_client_id.eq.${clientId},domain.eq.${domain}`)
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(10);
  const scanRows = (scans ?? []) as Array<{
    id: string;
    score: number | null;
    letter_grade: string | null;
    created_at: string;
    issues_json: unknown;
    full_results_json: unknown;
  }>;
  const latestScan = scanRows[0] ?? null;
  const previousScan = scanRows[1] ?? null;

  const { data: domainRow } = await admin
    .from('benchmark_domains')
    .select('id')
    .eq('canonical_domain', domain.toLowerCase().replace(/^www\./, ''))
    .maybeSingle();
  const { data: config } = domainRow?.id
    ? await admin
        .from('client_benchmark_configs')
        .select('id,topic,location,competitor_list,metadata,report_email,cadence')
        .eq('agency_account_id', client.agency_account_id)
        .eq('benchmark_domain_id', domainRow.id)
        .maybeSingle()
    : { data: null };
  const [outcome, prompts, reportResult] = await Promise.all([
    loadClientOutcomeEngine({
      supabase: admin,
      domain,
      configMetadata: config?.metadata as Record<string, unknown> | null,
      latestScan,
    }),
    getTrackedPromptPanel({ supabase: admin, domain }),
    config?.id
      ? admin
          .from('gpm_reports')
          .select('pdf_url,generated_at,platform')
          .eq('config_id', config.id)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const report = reportResult.data as { pdf_url?: string | null; generated_at?: string; platform?: string } | null;
  const readinessChange = latestScan?.score !== null && latestScan?.score !== undefined
    && previousScan?.score !== null && previousScan?.score !== undefined
    ? latestScan.score - previousScan.score
    : null;
  const brandColor = brand?.primaryHex || '#9b7b32';
  const displayName = client.display_name || client.name;

  return (
    <main className="min-h-screen bg-[#f4f3ef] px-4 py-8 text-[#171713] md:px-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[28px] bg-white shadow-xl print:max-w-none print:rounded-none print:shadow-none">
        <section className="min-h-[760px] p-7 md:p-12 print:min-h-[100vh]" style={{ borderTop: `8px solid ${brandColor}` }}>
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 pb-7">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: brandColor }}>AI visibility report</p>
              <h1 className="mt-3 text-4xl font-bold">{displayName}</h1>
              <p className="mt-2 text-sm text-black/60">{domain} · {config?.location || 'Market not set'}</p>
            </div>
            <div className="text-right">
              {brand?.logoUrl ? <img src={brand.logoUrl} alt="" className="mb-3 ml-auto h-10 max-w-[160px] object-contain" /> : null}
              <p className="text-sm font-bold">{agencyName}</p>
              <p className="mt-1 text-xs text-black/50">Prepared {new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(new Date())}</p>
            </div>
          </header>

          <div className="mt-9">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-black/45">Executive summary</p>
            <p className="mt-3 max-w-4xl text-xl leading-relaxed">{outcome.executiveSummary}</p>
          </div>

          <div className="mt-9 grid gap-4 sm:grid-cols-3">
            {[
              ['AI readiness', latestScan?.score !== null && latestScan?.score !== undefined ? `${latestScan.score}/100` : '—', changeLabel(readinessChange)],
              ['AI visibility', outcome.visibilityPct !== null ? `${outcome.visibilityPct}%` : '—', changeLabel(outcome.deltaPct)],
              ['Tracked questions', prompts.prompts.length || '—', outcome.measured ? 'Measured live' : 'Baseline pending'],
            ].map(([label, value, note]) => (
              <div key={String(label)} className="rounded-2xl bg-[#f4f3ef] p-5">
                <p className="text-xs font-semibold text-black/50">{label}</p>
                <p className="mt-3 text-3xl font-bold">{value}</p>
                <p className="mt-2 text-xs font-semibold" style={{ color: brandColor }}>{note}</p>
              </div>
            ))}
          </div>

          <div className="mt-9 grid gap-7 md:grid-cols-2">
            <div>
              <h2 className="text-lg font-bold">Visibility by AI platform</h2>
              <div className="mt-4 space-y-3">
                {outcome.engines.length > 0 ? outcome.engines.map((engine) => (
                  <div key={engine.engine} className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3">
                    <div>
                      <p className="font-semibold capitalize">{engine.engine === 'chatgpt' ? 'ChatGPT' : engine.engine}</p>
                      <p className="mt-0.5 text-xs text-black/45">{engine.modelId}</p>
                    </div>
                    <p className="text-2xl font-bold">{engine.visibilityPct}%</p>
                  </div>
                )) : <p className="rounded-xl bg-[#f4f3ef] p-4 text-sm text-black/55">The first live provider check has not completed yet.</p>}
              </div>
            </div>
            <div>
              <h2 className="text-lg font-bold">Competitors tracked</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {(config?.competitor_list ?? []).length > 0
                  ? (config!.competitor_list as string[]).map((competitor: string) => (
                      <span key={competitor} className="rounded-full bg-[#f4f3ef] px-3 py-2 text-sm font-semibold">{competitor}</span>
                    ))
                  : <p className="rounded-xl bg-[#f4f3ef] p-4 text-sm text-black/55">Competitor tracking starts with the first visibility setup.</p>}
              </div>
            </div>
          </div>
        </section>

        <section className="min-h-[760px] border-t border-black/10 p-7 md:p-12 print:min-h-[100vh] print:break-before-page">
          <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: brandColor }}>Customer questions</p>
              <h2 className="mt-2 text-2xl font-bold">What buyers are asking AI</h2>
              <div className="mt-5 space-y-2">
                {prompts.prompts.slice(0, 10).map((prompt) => (
                  <div key={prompt.queryText} className="rounded-xl border border-black/10 p-4">
                    <p className="text-sm font-semibold">{prompt.queryText}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {prompts.engineOrder.map((engine) => (
                        <span key={engine} className={`rounded-full px-2 py-1 font-semibold ${prompt.engines[engine] ? 'bg-emerald-100 text-emerald-800' : 'bg-[#f4f3ef] text-black/55'}`}>
                          {engine === 'chatgpt' ? 'ChatGPT' : engine} · {prompt.engines[engine] === null ? 'queued' : prompt.engines[engine] ? 'cited' : 'not cited'}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: brandColor }}>Recommended next</p>
              <h2 className="mt-2 text-2xl font-bold">Priority action plan</h2>
              <div className="mt-5 space-y-3">
                {outcome.actions.slice(0, 5).map((action, index) => (
                  <div key={action.key} className="rounded-xl bg-[#f4f3ef] p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-xs font-bold text-white">{index + 1}</span>
                      <div>
                        <p className="font-semibold">{action.title}</p>
                        <p className="mt-2 text-sm leading-relaxed text-black/60">{action.nextStep}</p>
                        <p className="mt-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: brandColor }}>{action.impact} impact · {action.effort} effort</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-xl border border-black/10 p-4 text-sm text-black/55">
                <p className="font-semibold text-black">Method</p>
                <p className="mt-2 leading-relaxed">{outcome.methodology}</p>
              </div>
              {report?.pdf_url ? (
                <Link href={report.pdf_url} className="mt-5 inline-flex rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">
                  Download full measurement report
                </Link>
              ) : null}
            </div>
          </div>
          <footer className="mt-10 border-t border-black/10 pt-5 text-xs text-black/45">
            {brand?.footerNote || `Prepared for ${displayName} by ${agencyName}.`}
            {brand?.showPoweredBy !== false ? ' Powered by GEO-Pulse.' : ''}
          </footer>
        </section>
      </div>
    </main>
  );
}
