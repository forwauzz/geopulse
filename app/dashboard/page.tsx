import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AgencyClientManagementView } from '@/components/agency-client-management-view';
import { signOut } from './actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAgencyDashboardData } from '@/lib/server/agency-dashboard-data';
import { isAdminEmail } from '@/lib/server/require-admin';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    agencyAccount?: string;
    agencyClient?: string;
  }>;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function gradeColor(grade: string | null): string {
  if (!grade) return 'bg-surface-container-high text-on-surface-variant';
  if (grade.startsWith('A')) return 'bg-primary/15 text-primary';
  if (grade.startsWith('B')) return 'bg-tertiary/15 text-tertiary';
  if (grade.startsWith('C')) return 'bg-warning/20 text-on-background';
  return 'bg-error/15 text-error';
}

function buildDashboardHref(accountId: string | null, clientId: string | null): string {
  const params = new URLSearchParams();
  if (accountId) params.set('agencyAccount', accountId);
  if (clientId) params.set('agencyClient', clientId);
  const query = params.toString();
  return query.length > 0 ? `/dashboard?${query}` : '/dashboard';
}

function buildNewScanHref(accountId: string | null, clientId: string | null): string {
  const params = new URLSearchParams();
  if (accountId) params.set('agencyAccount', accountId);
  if (clientId) params.set('agencyClient', clientId);
  const query = params.toString();
  return query.length > 0 ? `/dashboard/new-scan?${query}` : '/dashboard/new-scan';
}

export default async function DashboardPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard');
  }

  const [{ data: scans, error: scansErr }, { data: reports }, agencyDashboard] = await Promise.all([
    supabase
      .from('scans')
      .select('id, url, domain, score, letter_grade, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('reports')
      .select('id, scan_id, type, email_delivered_at, pdf_generated_at, pdf_url')
      .eq('user_id', user.id),
    getAgencyDashboardData({
      supabase,
      userId: user.id,
      selectedAccountId: sp.agencyAccount ?? null,
      selectedClientId: sp.agencyClient ?? null,
    }),
  ]);

  const reportList = reports ?? [];

  if (scansErr) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-error">Could not load scans.</p>
      </main>
    );
  }

  const reportByScan = new Map<string, (typeof reportList)[number]>();
  for (const r of reportList) {
    if (r.scan_id) {
      reportByScan.set(r.scan_id, r);
    }
  }

  const agencyReportByScan = new Map<string, (typeof agencyDashboard.reports)[number]>();
  for (const report of agencyDashboard.reports) {
    if (report.scanId) {
      agencyReportByScan.set(report.scanId, report);
    }
  }

  const scanList = scans ?? [];
  const totalScans = scanList.length;
  const scores = scanList.map((s) => s.score).filter((s): s is number => s != null);
  const avgScore =
    scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const deepAuditCount = reportList.filter((r) => r.type === 'deep_audit').length;

  const selectedAgencyAccount =
    agencyDashboard.accounts.find((account) => account.id === agencyDashboard.selectedAccountId) ?? null;
  const selectedAgencyClient =
    selectedAgencyAccount?.clients.find((client) => client.id === agencyDashboard.selectedClientId) ?? null;
  const agencyEntitlements = agencyDashboard.entitlements;

  return (
    <section className="min-h-[60vh]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">Account</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
            {agencyDashboard.accounts.length > 0 ? 'Dashboard' : 'Your scans'}
          </h1>
          <p className="mt-1 font-body text-on-surface-variant">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/new-scan"
            className="rounded-xl bg-primary px-4 py-2 font-body text-sm font-semibold text-on-primary transition hover:opacity-90"
          >
            New scan
          </Link>
          {isAdminEmail(user.email) ? (
            <span className="rounded-xl bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-surface-variant">
              Admin tools in left menu
            </span>
          ) : null}
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      {agencyDashboard.accounts.length > 0 ? (
        <section className="mt-8 rounded-2xl bg-surface-container-low p-6 shadow-float">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Agency</p>
              <h2 className="mt-2 font-headline text-2xl font-bold text-on-background">
                {selectedAgencyAccount?.name ?? agencyDashboard.accounts[0]?.name ?? 'Agency workspace'}
              </h2>
              <p className="mt-1 max-w-2xl font-body text-sm text-on-surface-variant">
                Client-scoped audit history for pilot agency work. Use the client context below to
                manage scans and reports per account.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {agencyDashboard.accounts.map((account) => (
                <Link
                  key={account.id}
                  href={buildDashboardHref(account.id, null)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    account.id === agencyDashboard.selectedAccountId
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-high text-on-background hover:bg-surface'
                  }`}
                >
                  {account.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {agencyEntitlements.scanLaunchEnabled ? (
              <Link
                href={buildNewScanHref(agencyDashboard.selectedAccountId, agencyDashboard.selectedClientId)}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition hover:opacity-90"
              >
                New client scan
              </Link>
            ) : (
              <span className="rounded-xl bg-surface-container-high px-4 py-2 text-sm font-medium text-on-surface-variant">
                Scan launch disabled by admin
              </span>
            )}
            <Link
              href={buildDashboardHref(agencyDashboard.selectedAccountId, null)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                agencyDashboard.selectedClientId === null
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high text-on-background hover:bg-surface'
              }`}
            >
              All clients
            </Link>
            {selectedAgencyAccount?.clients.map((client) => (
              <Link
                key={client.id}
                href={buildDashboardHref(selectedAgencyAccount.id, client.id)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  client.id === agencyDashboard.selectedClientId
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-high text-on-background hover:bg-surface'
                }`}
              >
                {client.name}
              </Link>
            ))}
          </div>

          {!agencyEntitlements.agencyDashboardEnabled ? (
            <div className="mt-6 rounded-xl bg-surface-container-lowest px-5 py-5 text-sm text-on-surface-variant">
              The agency dashboard module is disabled for this account. GEO-Pulse admin can re-enable it from
              the agency control plane.
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <div className="rounded-xl bg-surface-container-lowest px-4 py-4">
                  <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Agency scans</p>
                  <p className="mt-1 font-headline text-2xl font-bold text-on-background">
                    {agencyDashboard.scans.length}
                  </p>
                </div>
                <div className="rounded-xl bg-surface-container-lowest px-4 py-4">
                  <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Deep audits</p>
                  <p className="mt-1 font-headline text-2xl font-bold text-on-background">
                    {agencyDashboard.reports.filter((report) => report.type === 'deep_audit').length}
                  </p>
                </div>
                <div className="rounded-xl bg-surface-container-lowest px-4 py-4">
                  <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Context</p>
                  <p className="mt-1 font-body text-sm text-on-background">
                    {selectedAgencyClient?.name ?? 'All clients'}
                  </p>
                </div>
                <div className="rounded-xl bg-surface-container-lowest px-4 py-4">
                  <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">ICP</p>
                  <p className="mt-1 font-body text-sm text-on-background">
                    {selectedAgencyClient?.icpTag ??
                      selectedAgencyAccount?.benchmarkSubvertical ??
                      selectedAgencyAccount?.benchmarkVertical ??
                      '-'}
                  </p>
                </div>
              </div>

              {agencyEntitlements.geoTrackerEnabled ? (
                <div className="mt-4 rounded-xl bg-tertiary/10 px-4 py-4 text-sm text-on-background">
                  GEO tracker module is enabled for this agency account. The dedicated agency tracker surface is still
                  pending, but the entitlement is now live and preserved in control state.
                </div>
              ) : null}

              <AgencyClientManagementView
                agencyAccountId={selectedAgencyAccount?.id ?? ''}
                selectedClientId={selectedAgencyClient?.id ?? null}
                selectedClientName={selectedAgencyClient?.name ?? null}
                clientOptions={selectedAgencyAccount?.clients.map((client) => ({
                  id: client.id,
                  name: client.name,
                })) ?? []}
                selectedClientDomains={agencyDashboard.selectedClientDomains}
              />

              {agencyEntitlements.reportHistoryEnabled ? (
                <ul className="mt-8 space-y-4">
                  {agencyDashboard.scans.length === 0 ? (
                    <li className="rounded-xl bg-surface-container-lowest p-6 text-center font-body text-on-surface-variant">
                      No agency scans are linked to this client context yet.
                    </li>
                  ) : (
                    agencyDashboard.scans.map((scan) => {
                      const report = agencyReportByScan.get(scan.id);
                      const hasPdf = report?.type === 'deep_audit' && !!report.pdfUrl;
                      const isDelivered = report?.type === 'deep_audit' && !!report.emailDeliveredAt;
                      return (
                        <li key={scan.id} className="rounded-xl bg-surface-container-lowest px-5 py-5">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <span className="font-headline text-lg font-semibold text-on-background">
                                {scan.domain}
                              </span>
                              {scan.letterGrade ? (
                                <span
                                  className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold ${gradeColor(
                                    scan.letterGrade
                                  )}`}
                                >
                                  {scan.letterGrade}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-right text-sm text-on-surface-variant">
                              <div>{scan.score != null ? `${scan.score}/100` : '-'}</div>
                              <div className="text-xs">{formatDate(scan.createdAt)}</div>
                            </div>
                          </div>
                          <p className="mt-1 truncate font-body text-sm text-on-surface-variant">
                            {scan.url}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-lg bg-surface-container-high px-2.5 py-1 text-on-surface-variant">
                              {scan.runSource}
                            </span>
                            {isDelivered ? (
                              <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-primary">
                                Report delivered
                              </span>
                            ) : report?.type === 'deep_audit' ? (
                              <span className="rounded-lg bg-warning/10 px-2.5 py-1 text-on-background">
                                Deep audit linked
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3 border-t border-outline-variant/10 pt-3 font-body text-sm">
                            <Link
                              href={`/results/${scan.id}`}
                              className="inline-flex items-center gap-1 font-medium text-tertiary hover:underline"
                            >
                              <span className="material-symbols-outlined text-sm">visibility</span>
                              View results
                            </Link>
                            {hasPdf ? (
                              <a
                                href={report?.pdfUrl ?? '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-medium text-tertiary hover:underline"
                              >
                                <span className="material-symbols-outlined text-sm">download</span>
                                Download PDF
                              </a>
                            ) : null}
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : (
                <div className="mt-8 rounded-xl bg-surface-container-lowest p-6 text-sm text-on-surface-variant">
                  Audit and report history is disabled for this agency context by GEO-Pulse admin.
                </div>
              )}
            </>
          )}
        </section>
      ) : null}

      <section className="mt-8">
        {totalScans > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Scans</p>
              <p className="mt-1 font-headline text-2xl font-bold text-on-background">{totalScans}</p>
            </div>
            <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Avg score</p>
              <p className="mt-1 font-headline text-2xl font-bold text-on-background">
                {avgScore != null ? `${avgScore}/100` : '\u2014'}
              </p>
            </div>
            <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Deep audits</p>
              <p className="mt-1 font-headline text-2xl font-bold text-on-background">{deepAuditCount}</p>
            </div>
          </div>
        )}

        <div className="mt-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-headline text-2xl font-bold text-on-background">Personal scans</h2>
            <p className="mt-1 font-body text-sm text-on-surface-variant">
              Your existing self-serve scans and purchased reports remain separate from agency client context.
            </p>
          </div>
        </div>

        <ul className="mt-6 space-y-4">
          {totalScans === 0 ? (
            <li className="rounded-xl bg-surface-container-low p-8 text-center font-body text-on-surface-variant">
              No scans linked yet. Run a free audit on the{' '}
              <Link href="/" className="font-medium text-tertiary hover:underline">
                home page
              </Link>
              . If you already bought a report, make sure you signed in with the same email you used at Stripe checkout.
            </li>
          ) : (
            scanList.map((s) => {
              const rep = reportByScan.get(s.id);
              const isDeepAudit = rep?.type === 'deep_audit';
              const isDelivered = isDeepAudit && !!rep?.email_delivered_at;
              const hasPdf = isDeepAudit && !!rep?.pdf_url;

              return (
                <li key={s.id} className="rounded-xl bg-surface-container-lowest px-5 py-5 shadow-float">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-headline text-lg font-semibold text-on-background">{s.domain}</span>
                      {s.letter_grade ? (
                        <span className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold ${gradeColor(s.letter_grade)}`}>
                          {s.letter_grade}
                        </span>
                      ) : null}
                    </div>
                    {s.score != null ? (
                      <span className="font-body text-sm text-on-surface-variant">
                        <strong className="text-on-background">{s.score}</strong>/100
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1 truncate font-body text-sm text-on-surface-variant">{s.url}</p>
                  <p className="mt-1 font-body text-xs text-on-surface-variant">{formatDate(s.created_at)}</p>

                  <div className="mt-3 flex items-center gap-2">
                    {isDelivered ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        <span className="material-symbols-outlined text-sm">task_alt</span>
                        Report delivered
                      </span>
                    ) : isDeepAudit ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-warning/10 px-2.5 py-1 text-xs font-medium text-on-background">
                        <span className="material-symbols-outlined text-sm">hourglass_top</span>
                        Generating report
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-lg bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                        Free scan
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-3 border-t border-outline-variant/10 pt-3 font-body text-sm">
                    <Link href={`/results/${s.id}`} className="inline-flex items-center gap-1 font-medium text-tertiary hover:underline">
                      <span className="material-symbols-outlined text-sm">visibility</span>
                      View results
                    </Link>
                    {hasPdf && rep?.pdf_url ? (
                      <a
                        href={rep.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-tertiary hover:underline"
                      >
                        <span className="material-symbols-outlined text-sm">download</span>
                        Download PDF
                      </a>
                    ) : null}
                    <Link
                      href={`/dashboard/new-scan?url=${encodeURIComponent(s.url)}`}
                      className="inline-flex items-center gap-1 font-medium text-on-surface-variant hover:text-primary"
                    >
                      <span className="material-symbols-outlined text-sm">refresh</span>
                      Rescan
                    </Link>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>
    </section>
  );
}
