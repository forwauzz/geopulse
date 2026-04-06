import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AgencyClientManagementView } from '@/components/agency-client-management-view';
import { WhatNextBanner } from '@/components/what-next-banner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAgencyDashboardData } from '@/lib/server/agency-dashboard-data';
import { buildAgencyDashboardUiGates } from '@/lib/server/agency-access';
import { getStartupDashboardData } from '@/lib/server/startup-dashboard-data';
import {
  buildStartupTrendSeries,
  buildStartupActionBacklog,
} from '@/lib/server/startup-dashboard-shell';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    agencyAccount?: string;
    agencyClient?: string;
    startupWorkspace?: string;
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

function buildDashboardHref(args: {
  agencyAccountId?: string | null;
  agencyClientId?: string | null;
  startupWorkspaceId?: string | null;
}): string {
  const params = new URLSearchParams();
  if (args.agencyAccountId) params.set('agencyAccount', args.agencyAccountId);
  if (args.agencyClientId) params.set('agencyClient', args.agencyClientId);
  if (args.startupWorkspaceId) params.set('startupWorkspace', args.startupWorkspaceId);
  const query = params.toString();
  return query.length > 0 ? `/dashboard?${query}` : '/dashboard';
}

function buildNewScanHref(args: {
  agencyAccountId?: string | null;
  agencyClientId?: string | null;
  startupWorkspaceId?: string | null;
}): string {
  const params = new URLSearchParams();
  if (args.agencyAccountId) params.set('agencyAccount', args.agencyAccountId);
  if (args.agencyClientId) params.set('agencyClient', args.agencyClientId);
  if (args.startupWorkspaceId) params.set('startupWorkspace', args.startupWorkspaceId);
  const query = params.toString();
  return query.length > 0 ? `/dashboard/new-scan?${query}` : '/dashboard/new-scan';
}

// ─────────────────────────────────────────────────────────────
// Stat card — reused across all persona sections
// ─────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  accent,
}: {
  readonly label: string;
  readonly value: string;
  readonly accent?: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface-container-lowest px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
        {label}
      </p>
      <p
        className={`mt-1 font-headline text-2xl font-bold ${accent ? 'text-primary' : 'text-on-background'}`}
      >
        {value}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared scan row — used in all three persona sections
// ─────────────────────────────────────────────────────────────
type ScanRowProps = {
  id: string;
  domain: string;
  url: string;
  score: number | null;
  letterGrade: string | null;
  createdAt: string;
  runSource?: string | null;
  reportStatus: 'none' | 'generating' | 'delivered';
  hasPdf: boolean;
  pdfUrl?: string | null;
  contextLabel?: string | null;
};

function ScanRow({
  id,
  domain,
  url,
  score,
  letterGrade,
  createdAt,
  runSource,
  reportStatus,
  hasPdf,
  pdfUrl,
  contextLabel,
}: ScanRowProps) {
  return (
    <li className="rounded-xl bg-surface-container-lowest px-5 py-4 shadow-float">
      {/* Top row: domain + grade + score */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-headline text-base font-semibold text-on-background">{domain}</span>
          {letterGrade ? (
            <span
              className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold ${gradeColor(letterGrade)}`}
            >
              {letterGrade}
            </span>
          ) : null}
          {contextLabel ? (
            <span className="rounded-lg bg-surface-container-high px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">
              {contextLabel}
            </span>
          ) : null}
        </div>
        <div className="text-right">
          {score != null ? (
            <span className="font-body text-sm text-on-surface-variant">
              <strong className="text-on-background">{score}</strong>/100
            </span>
          ) : null}
        </div>
      </div>

      {/* URL + date */}
      <p className="mt-1 truncate font-body text-sm text-on-surface-variant">{url}</p>
      <p className="mt-0.5 font-body text-xs text-on-surface-variant">{formatDate(createdAt)}</p>

      {/* Status badges */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {reportStatus === 'delivered' ? (
          <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <span className="material-symbols-outlined text-sm" aria-hidden>task_alt</span>
            Report delivered
          </span>
        ) : reportStatus === 'generating' ? (
          <span className="inline-flex items-center gap-1 rounded-lg bg-warning/10 px-2.5 py-1 text-xs font-medium text-on-background">
            <span className="material-symbols-outlined text-sm" aria-hidden>hourglass_top</span>
            Generating report
          </span>
        ) : (
          <span className="rounded-lg bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface-variant">
            Free scan
          </span>
        )}
        {runSource ? (
          <span className="rounded-lg bg-surface-container-high px-2.5 py-1 text-xs text-on-surface-variant">
            {runSource}
          </span>
        ) : null}
      </div>

      {/* Action links */}
      <div className="mt-3 flex flex-wrap gap-3 border-t border-outline-variant/10 pt-3 font-body text-sm">
        <Link
          href={`/results/${id}`}
          className="inline-flex items-center gap-1 font-medium text-tertiary hover:underline"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden>visibility</span>
          View results
        </Link>
        {hasPdf && pdfUrl ? (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-tertiary hover:underline"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden>download</span>
            Download PDF
          </a>
        ) : null}
        <Link
          href={`/dashboard/new-scan?url=${encodeURIComponent(url)}`}
          className="inline-flex items-center gap-1 font-medium text-on-surface-variant hover:text-primary"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden>refresh</span>
          Rescan
        </Link>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────
export default async function DashboardPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard');
  }

  const [{ data: scans, error: scansErr }, { data: reports }, agencyDashboard, startupDashboard] =
    await Promise.all([
      supabase
        .from('scans')
        .select('id, url, domain, score, letter_grade, created_at')
        .eq('user_id', user.id)
        .is('agency_account_id', null)
        .is('startup_workspace_id', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('reports')
        .select('id, scan_id, type, email_delivered_at, pdf_generated_at, pdf_url')
        .eq('user_id', user.id)
        .is('agency_account_id', null)
        .is('startup_workspace_id', null),
      getAgencyDashboardData({
        supabase,
        userId: user.id,
        selectedAccountId: sp.agencyAccount ?? null,
        selectedClientId: sp.agencyClient ?? null,
      }),
      getStartupDashboardData({
        supabase,
        userId: user.id,
        selectedWorkspaceId: sp.startupWorkspace ?? null,
      }),
    ]);

  const reportList = reports ?? [];

  if (scansErr) {
    return (
      <div className="rounded-xl bg-surface-container-lowest p-6 text-sm text-error">
        Could not load scans. Please refresh the page.
      </div>
    );
  }

  // ── Report maps ─────────────────────────────────────────────
  const reportByScan = new Map<string, (typeof reportList)[number]>();
  for (const r of reportList) {
    if (r.scan_id) reportByScan.set(r.scan_id, r);
  }

  const agencyReportByScan = new Map<string, (typeof agencyDashboard.reports)[number]>();
  for (const r of agencyDashboard.reports) {
    if (r.scanId) agencyReportByScan.set(r.scanId, r);
  }

  const startupReportByScan = new Map<string, (typeof startupDashboard.reports)[number]>();
  for (const r of startupDashboard.reports) {
    if (r.scanId) startupReportByScan.set(r.scanId, r);
  }

  // ── Personal stats ──────────────────────────────────────────
  const scanList = scans ?? [];
  const totalScans = scanList.length;
  const scores = scanList.map((s) => s.score).filter((s): s is number => s != null);
  const avgScore =
    scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const deepAuditCount = reportList.filter((r) => r.type === 'deep_audit').length;
  const deliveredReport = reportList.find(
    (r) => r.type === 'deep_audit' && !!r.email_delivered_at
  );

  // ── Context ─────────────────────────────────────────────────
  const selectedAgencyAccount =
    agencyDashboard.accounts.find((a) => a.id === agencyDashboard.selectedAccountId) ?? null;
  const selectedAgencyClient =
    selectedAgencyAccount?.clients.find((c) => c.id === agencyDashboard.selectedClientId) ?? null;
  const agencyUiGates = buildAgencyDashboardUiGates(agencyDashboard.entitlements);
  const selectedStartupWorkspace =
    startupDashboard.workspaces.find((w) => w.id === startupDashboard.selectedWorkspaceId) ?? null;

  const newScanHref = buildNewScanHref({
    agencyAccountId: agencyDashboard.selectedAccountId,
    agencyClientId: agencyDashboard.selectedClientId,
    startupWorkspaceId: startupDashboard.selectedWorkspaceId,
  });

  // ── Personal WhatNextBanner ──────────────────────────────────
  type BannerConfig = {
    eyebrow: string;
    title: string;
    body: string;
    ctaLabel: string;
    ctaHref: string;
  };

  function getPersonalBanner(): BannerConfig {
    if (totalScans === 0) {
      return {
        eyebrow: 'Start here',
        title: 'Run your first audit',
        body: 'Enter any URL to get an instant AI search readiness score. Free, under 30 seconds.',
        ctaLabel: 'Run a Scan',
        ctaHref: '/dashboard/new-scan',
      };
    }
    if (deliveredReport?.scan_id) {
      return {
        eyebrow: 'Report ready',
        title: 'Your deep audit is ready',
        body: 'Download your full PDF report or view the structured results online.',
        ctaLabel: 'Open Report',
        ctaHref: `/results/${deliveredReport.scan_id}`,
      };
    }
    if (deepAuditCount > 0) {
      return {
        eyebrow: 'In progress',
        title: 'Your report is being prepared',
        body: 'Deep audit generation usually takes 2–5 minutes. Check your email for delivery.',
        ctaLabel: 'View Latest',
        ctaHref: `/results/${scanList[0]?.id ?? ''}`,
      };
    }
    return {
      eyebrow: "What's next",
      title: 'Ready to go deeper?',
      body: 'Get a full deep audit with prioritized recommendations, technical fixes, and a PDF report.',
      ctaLabel: 'Upgrade to Deep Audit',
      ctaHref: `/results/${scanList[0]?.id ?? ''}`,
    };
  }

  const personalBanner = getPersonalBanner();

  // ── Agency WhatNextBanner ────────────────────────────────────
  function getAgencyBanner(): BannerConfig {
    if (!selectedAgencyAccount) {
      return {
        eyebrow: 'Agency workspace',
        title: 'Select an account to get started',
        body: 'Use the account switcher above to choose a workspace, then select a client.',
        ctaLabel: 'Run a Scan',
        ctaHref: '/dashboard/new-scan',
      };
    }
    if (!selectedAgencyClient) {
      return {
        eyebrow: 'What\'s next',
        title: `Select a client to start scanning`,
        body: `Choose a client from the row below to scope scans, stats, and recommendations to that account.`,
        ctaLabel: 'Run a Scan',
        ctaHref: buildNewScanHref({ agencyAccountId: selectedAgencyAccount.id }),
      };
    }
    if (agencyDashboard.scans.length === 0) {
      return {
        eyebrow: 'Start here',
        title: `Run your first scan for ${selectedAgencyClient.name}`,
        body: 'Kick off an audit to see their AI search readiness score and issue breakdown.',
        ctaLabel: 'Run a Scan',
        ctaHref: buildNewScanHref({
          agencyAccountId: selectedAgencyAccount.id,
          agencyClientId: selectedAgencyClient.id,
        }),
      };
    }
    return {
      eyebrow: "What's next",
      title: `${agencyDashboard.scans.length} scan${agencyDashboard.scans.length === 1 ? '' : 's'} for ${selectedAgencyClient.name}`,
      body: 'Review the latest results or run a new scan to track changes over time.',
      ctaLabel: 'View Latest',
      ctaHref: `/results/${agencyDashboard.scans[0]?.id ?? ''}`,
    };
  }

  const agencyBanner = agencyDashboard.accounts.length > 0 ? getAgencyBanner() : null;

  // ── Startup computed data ────────────────────────────────────
  const startupTrend = buildStartupTrendSeries(startupDashboard.scans);
  const startupBacklog = buildStartupActionBacklog(startupDashboard);

  const startupScores = startupDashboard.scans
    .map((s) => s.score)
    .filter((s): s is number => s != null);
  const startupAvgScore =
    startupScores.length > 0
      ? Math.round(startupScores.reduce((a, b) => a + b, 0) / startupScores.length)
      : null;

  const openStatuses = new Set(['suggested', 'approved', 'in_progress', 'shipped']);
  const startupOpenRecs = startupDashboard.recommendations.filter((r) =>
    openStatuses.has(r.status)
  ).length;

  // ── Startup WhatNextBanner (step-based) ──────────────────────
  function getStartupBanner(): BannerConfig {
    if (startupDashboard.scans.length === 0) {
      return {
        eyebrow: 'Step 1 of 3',
        title: 'Run your first startup scan',
        body: 'Kick off an AI search readiness audit to populate your score trend and action backlog.',
        ctaLabel: 'Run a Scan',
        ctaHref: buildNewScanHref({ startupWorkspaceId: startupDashboard.selectedWorkspaceId }),
      };
    }
    if (startupDashboard.recommendations.length === 0) {
      return {
        eyebrow: 'Step 2 of 3',
        title: 'Review your scan results',
        body: 'Your first scan is in. Check the score trend and connect your implementation tools.',
        ctaLabel: 'View Results',
        ctaHref: `/results/${startupDashboard.scans[0]?.id ?? ''}`,
      };
    }
    return {
      eyebrow: 'Step 3 of 3',
      title: 'Connect GitHub & Slack to automate delivery',
      body: 'Link your tools to enable PR creation from recommendations and Slack audit notifications.',
      ctaLabel: 'Go to Connectors',
      ctaHref: '/dashboard/connectors',
    };
  }

  const startupBanner =
    startupDashboard.workspaces.length > 0 ? getStartupBanner() : null;

  const selectedAgencyAccount =
    agencyDashboard.accounts.find((account) => account.id === agencyDashboard.selectedAccountId) ?? null;
  const selectedAgencyClient =
    selectedAgencyAccount?.clients.find((client) => client.id === agencyDashboard.selectedClientId) ?? null;
  const agencyUiGates = buildAgencyDashboardUiGates(agencyDashboard.entitlements);
  const selectedStartupWorkspace =
    startupDashboard.workspaces.find((workspace) => workspace.id === startupDashboard.selectedWorkspaceId) ?? null;

  return (
    <section className="min-h-[60vh] space-y-10">

      {/* ── Page header ─────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
          {agencyDashboard.accounts.length > 0 || startupDashboard.workspaces.length > 0
            ? 'Account'
            : 'Personal workspace'}
        </p>
        <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Dashboard</h1>
        <p className="mt-1 font-body text-sm text-on-surface-variant">{user.email}</p>
      </div>

      {/* ── Startup workspace section ────────────────────────── */}
      {startupDashboard.workspaces.length > 0 ? (
        <section className="rounded-2xl bg-surface-container-low p-6 shadow-float">
          {/* Context bar */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                Startup workspace
              </p>
              <h2 className="mt-1.5 font-headline text-xl font-bold text-on-background">
                {selectedStartupWorkspace?.name ??
                  startupDashboard.workspaces[0]?.name ??
                  'Startup workspace'}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {selectedStartupWorkspace?.workspaceKey ? (
                  <span className="rounded-lg bg-surface-container-high px-2 py-0.5 font-mono text-[10px] text-on-surface-variant">
                    {selectedStartupWorkspace.workspaceKey}
                  </span>
                ) : null}
                {selectedStartupWorkspace?.canonicalDomain ? (
                  <span className="rounded-lg bg-surface-container-high px-2 py-0.5 text-[10px] text-on-surface-variant">
                    {selectedStartupWorkspace.canonicalDomain}
                  </span>
                ) : null}
                <span className="rounded-lg bg-surface-container-high px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">
                  Role: {selectedStartupWorkspace?.role ?? 'member'}
                </span>
              </div>
            </div>
            {/* Workspace switcher */}
            {startupDashboard.workspaces.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {startupDashboard.workspaces.map((workspace) => (
                  <Link
                    key={workspace.id}
                    href={buildDashboardHref({ startupWorkspaceId: workspace.id })}
                    className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                      workspace.id === startupDashboard.selectedWorkspaceId
                        ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                        : 'bg-surface-container-high text-on-background hover:bg-surface'
                    }`}
                  >
                    {workspace.name}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          {/* WhatNextBanner */}
          {startupBanner ? (
            <div className="mt-5">
              <WhatNextBanner
                eyebrow={startupBanner.eyebrow}
                title={startupBanner.title}
                body={startupBanner.body}
                ctaLabel={startupBanner.ctaLabel}
                ctaHref={startupBanner.ctaHref}
              />
            </div>
          ) : null}

          {/* Stats */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Scans" value={String(startupDashboard.scans.length)} />
            <StatCard
              label="Avg score"
              value={startupAvgScore != null ? `${startupAvgScore}/100` : '—'}
              accent={startupAvgScore != null}
            />
            <StatCard
              label="Recommendations"
              value={String(startupDashboard.recommendations.length)}
            />
            <StatCard label="Open" value={String(startupOpenRecs)} />
          </div>

          {/* Score trend + action backlog — two-column grid */}
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {/* Score trend sparkline */}
            <div className="rounded-xl bg-surface-container-lowest p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                Score trend
              </p>
              {startupTrend.length === 0 ? (
                <p className="mt-3 text-sm text-on-surface-variant">
                  No scored scans yet — run a scan to populate the trend.
                </p>
              ) : (
                <>
                  <svg viewBox="0 0 240 64" className="mt-3 h-16 w-full text-primary">
                    <path
                      d={startupTrend
                        .map((point, i) => {
                          const min = Math.min(...startupTrend.map((p) => p.score));
                          const max = Math.max(...startupTrend.map((p) => p.score));
                          const spread = Math.max(max - min, 1);
                          const step = startupTrend.length > 1 ? 240 / (startupTrend.length - 1) : 240;
                          const x = i * step;
                          const y = 64 - ((point.score - min) / spread) * 64;
                          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                        })
                        .join(' ')}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {startupTrend.map((point) => (
                      <span
                        key={`${point.label}-${point.score}`}
                        className="rounded-md bg-surface-container-high px-2 py-0.5 text-[10px] text-on-surface-variant"
                      >
                        {point.label}: <strong className="text-on-background">{point.score}</strong>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Action backlog */}
            <div className="rounded-xl bg-surface-container-lowest p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                Action backlog
              </p>
              <ul className="mt-3 space-y-2">
                {startupBacklog.slice(0, 3).map((item) => (
                  <li
                    key={item.key}
                    className="rounded-lg border border-outline-variant/10 bg-surface-container-low p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-on-background">{item.title}</p>
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          item.priority === 'high'
                            ? 'bg-error/10 text-error'
                            : 'bg-warning/15 text-on-background'
                        }`}
                      >
                        {item.priority}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-on-surface-variant">{item.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recent scans — last 3 */}
          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                Recent scans
              </p>
              <Link
                href={
                  startupDashboard.selectedWorkspaceId
                    ? `/dashboard/startup?startupWorkspace=${startupDashboard.selectedWorkspaceId}&tab=audits`
                    : '/dashboard/startup?tab=audits'
                }
                className="text-xs font-medium text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            <ul className="space-y-3">
              {startupDashboard.scans.length === 0 ? (
                <li className="rounded-xl bg-surface-container-lowest p-6 text-center text-sm text-on-surface-variant">
                  No startup scans yet — run your first scan using the button above.
                </li>
              ) : (
                startupDashboard.scans.slice(0, 3).map((scan) => {
                  const report = startupReportByScan.get(scan.id);
                  const isDeepAudit = report?.type === 'deep_audit';
                  const reportStatus =
                    isDeepAudit && report?.emailDeliveredAt
                      ? 'delivered'
                      : isDeepAudit
                        ? 'generating'
                        : 'none';
                  return (
                    <ScanRow
                      key={scan.id}
                      id={scan.id}
                      domain={scan.domain}
                      url={scan.url}
                      score={scan.score}
                      letterGrade={scan.letterGrade}
                      createdAt={scan.createdAt}
                      runSource={scan.runSource}
                      reportStatus={reportStatus}
                      hasPdf={isDeepAudit && !!report?.pdfUrl}
                      pdfUrl={report?.pdfUrl}
                    />
                  );
                })
              )}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ── Agency workspace section ─────────────────────────── */}
      {agencyDashboard.accounts.length > 0 ? (
        <section className="rounded-2xl bg-surface-container-low p-6 shadow-float">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                Agency workspace
              </p>
              <h2 className="mt-1.5 font-headline text-xl font-bold text-on-background">
                {selectedAgencyAccount?.name ??
                  agencyDashboard.accounts[0]?.name ??
                  'Agency workspace'}
              </h2>
            </div>
            {/* Account switcher */}
            <div className="flex flex-wrap gap-2">
              {agencyDashboard.accounts.map((account) => (
                <Link
                  key={account.id}
                  href={buildDashboardHref({ agencyAccountId: account.id })}
                  className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
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

          {/* Client chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            {agencyUiGates.scanLaunch ? (
              <Link
                href={buildNewScanHref({
                  agencyAccountId: agencyDashboard.selectedAccountId,
                  agencyClientId: agencyDashboard.selectedClientId,
                })}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
              >
                New client scan
              </Link>
            ) : (
              <span className="rounded-xl bg-surface-container-high px-4 py-2 text-sm font-medium text-on-surface-variant">
                Scan launch disabled
              </span>
            )}
            <Link
              href={buildDashboardHref({ agencyAccountId: agencyDashboard.selectedAccountId })}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                agencyDashboard.selectedClientId === null
                  ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                  : 'bg-surface-container-high text-on-background hover:bg-surface'
              }`}
            >
              All clients
            </Link>
            {selectedAgencyAccount?.clients.map((client) => (
              <Link
                key={client.id}
                href={buildDashboardHref({
                  agencyAccountId: selectedAgencyAccount.id,
                  agencyClientId: client.id,
                })}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  client.id === agencyDashboard.selectedClientId
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                    : 'bg-surface-container-high text-on-background hover:bg-surface'
                }`}
              >
                {client.name}
              </Link>
            ))}
          </div>

          {/* WhatNextBanner — always visible when agency section is showing */}
          {agencyBanner ? (
            <div className="mt-5">
              <WhatNextBanner
                eyebrow={agencyBanner.eyebrow}
                title={agencyBanner.title}
                body={agencyBanner.body}
                ctaLabel={agencyBanner.ctaLabel}
                ctaHref={agencyBanner.ctaHref}
              />
            </div>
          ) : null}

          {!agencyUiGates.agencyDashboard ? (
            <p className="mt-6 rounded-xl bg-surface-container-lowest px-5 py-5 text-sm text-on-surface-variant">
              The agency dashboard is disabled for this account. Contact GEO-Pulse admin to re-enable it.
            </p>
          ) : (
            <>
              {/* Stats */}
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Agency scans" value={String(agencyDashboard.scans.length)} />
                <StatCard
                  label="Deep audits"
                  value={String(
                    agencyDashboard.reports.filter((r) => r.type === 'deep_audit').length
                  )}
                />
                <StatCard
                  label="Client"
                  value={selectedAgencyClient?.name ?? 'All clients'}
                />
                <StatCard
                  label="ICP"
                  value={
                    selectedAgencyClient?.icpTag ??
                    selectedAgencyAccount?.benchmarkSubvertical ??
                    selectedAgencyAccount?.benchmarkVertical ??
                    '—'
                  }
                />
              </div>

              {agencyUiGates.geoTracker ? (
                <div className="mt-4 rounded-xl bg-tertiary/10 px-4 py-3 text-sm text-on-background">
                  GEO tracker module is enabled for this agency account.
                </div>
              ) : null}

              {/* Manage clients — collapsible disclosure */}
              <details className="mt-5 rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
                <summary className="flex cursor-pointer select-none items-center justify-between px-5 py-3 text-sm font-semibold text-on-background hover:bg-surface-container-low rounded-xl transition">
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden>group</span>
                    Manage clients
                  </span>
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden>expand_more</span>
                </summary>
                <div className="border-t border-outline-variant/10 px-5 pb-5 pt-4">
                  <AgencyClientManagementView
                    agencyAccountId={selectedAgencyAccount?.id ?? ''}
                    selectedClientId={selectedAgencyClient?.id ?? null}
                    selectedClientName={selectedAgencyClient?.name ?? null}
                    clientOptions={
                      selectedAgencyAccount?.clients.map((c) => ({ id: c.id, name: c.name })) ?? []
                    }
                    selectedClientDomains={agencyDashboard.selectedClientDomains}
                  />
                </div>
              </details>

              {agencyUiGates.reportHistory ? (
                <ul className="mt-6 space-y-3">
                  {agencyDashboard.scans.length === 0 ? (
                    <li className="rounded-xl bg-surface-container-lowest p-6 text-center text-sm text-on-surface-variant">
                      No agency scans for this context yet.
                    </li>
                  ) : (
                    agencyDashboard.scans.map((scan) => {
                      const report = agencyReportByScan.get(scan.id);
                      const isDeepAudit = report?.type === 'deep_audit';
                      const reportStatus =
                        isDeepAudit && report?.emailDeliveredAt
                          ? 'delivered'
                          : isDeepAudit
                            ? 'generating'
                            : 'none';
                      return (
                        <ScanRow
                          key={scan.id}
                          id={scan.id}
                          domain={scan.domain}
                          url={scan.url}
                          score={scan.score}
                          letterGrade={scan.letterGrade}
                          createdAt={scan.createdAt}
                          runSource={scan.runSource}
                          reportStatus={reportStatus}
                          hasPdf={isDeepAudit && !!report?.pdfUrl}
                          pdfUrl={report?.pdfUrl}
                        />
                      );
                    })
                  )}
                </ul>
              ) : (
                <p className="mt-6 rounded-xl bg-surface-container-lowest px-5 py-4 text-sm text-on-surface-variant">
                  Audit history is disabled for this agency context by GEO-Pulse admin.
                </p>
              )}
            </>
          )}
        </section>
      ) : null}

      {/* ── Personal scans section ───────────────────────────── */}
      <section>
        <div className="mb-5">
          <h2 className="font-headline text-xl font-bold text-on-background">Your scans</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Personal audits — separate from any agency or startup context.
          </p>
        </div>

        {/* What's next banner — always visible */}
        <WhatNextBanner
          eyebrow={personalBanner.eyebrow}
          title={personalBanner.title}
          body={personalBanner.body}
          ctaLabel={personalBanner.ctaLabel}
          ctaHref={personalBanner.ctaHref}
        />

        {/* Stats — only when there are scans */}
        {totalScans > 0 ? (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Scans" value={String(totalScans)} />
            <StatCard
              label="Avg score"
              value={avgScore != null ? `${avgScore}/100` : '—'}
              accent={avgScore != null}
            />
            <StatCard label="Deep audits" value={String(deepAuditCount)} />
          </div>
        ) : null}

        {/* Scan list */}
        <ul className="mt-5 space-y-3">
          {totalScans === 0 ? (
            <li className="rounded-xl bg-surface-container-lowest p-8 text-center text-sm text-on-surface-variant">
              No scans yet — run your first audit using the{' '}
              <Link
                href="/dashboard/new-scan"
                className="font-medium text-primary hover:underline"
              >
                Run a Scan
              </Link>{' '}
              button in the sidebar.
            </li>
          ) : (
            scanList.map((s) => {
              const rep = reportByScan.get(s.id);
              const isDeepAudit = rep?.type === 'deep_audit';
              const reportStatus =
                isDeepAudit && !!rep?.email_delivered_at
                  ? 'delivered'
                  : isDeepAudit
                    ? 'generating'
                    : 'none';
              return (
                <ScanRow
                  key={s.id}
                  id={s.id}
                  domain={s.domain}
                  url={s.url}
                  score={s.score}
                  letterGrade={s.letter_grade}
                  createdAt={s.created_at}
                  reportStatus={reportStatus}
                  hasPdf={isDeepAudit && !!rep?.pdf_url}
                  pdfUrl={rep?.pdf_url}
                />
              );
            })
          )}
        </ul>
      </section>
    </section>
  );
}
