import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  beginStartupGithubInstall,
  beginStartupSlackInstall,
  disconnectStartupGithub,
  disconnectStartupSlack,
  saveStartupGithubAllowlist,
  saveStartupSlackDestination,
  sendStartupMarkdownToSlack,
  sendStartupReportToSlack,
  updateStartupAuditCadence,
  updateStartupSlackAutoPostSetting,
} from '@/app/dashboard/startup/actions';
import { loadStartupConnectorsContext } from '@/app/dashboard/connectors/lib/load-startup-connectors-context';
import { buildProvisioningPendingCopy } from '@/app/dashboard/connectors/lib/provisioning-pending-copy';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    startupWorkspace?: string;
    github?: string;
    slack?: string;
    slack_detail?: string;
  }>;
};

// ── Status banner (OAuth return messages) ───────────────────────
function statusMessage(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key === 'success') return 'Connection successful.';
  if (key === 'error') return 'Connection failed. Please try again.';
  if (key === 'cancelled') return 'Connection cancelled.';
  if (key === 'already_connected') return 'This integration is already connected.';
  return null;
}

// ── Connection status badge ──────────────────────────────────────
function StatusBadge({ status }: { readonly status: string }) {
  const isConnected = status === 'connected';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-xs font-semibold ${
        isConnected
          ? 'bg-primary/15 text-primary'
          : 'bg-surface-container-high text-on-surface-variant'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-primary' : 'bg-on-surface-variant'}`}
        aria-hidden
      />
      {status}
    </span>
  );
}

export default async function ConnectorsPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard/connectors');
  }

  const githubMsg = statusMessage(sp.github);
  const slackMsg = statusMessage(sp.slack);

  const loaded = await loadStartupConnectorsContext({
    supabase,
    userId: user.id,
    sp: {
      startupWorkspace: sp.startupWorkspace,
      github: sp.github,
      slack: sp.slack,
      slack_detail: sp.slack_detail,
    },
  });

  // ── No startup workspace ─────────────────────────────────────
  if (loaded.kind === 'workspace-provisioning') {
    const provisioningCopy = buildProvisioningPendingCopy(loaded.bundleKey);
    return (
      <section className="space-y-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Dashboard</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Connectors</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Integrate GitHub and Slack with your startup workspace.
          </p>
        </div>
        <div className="rounded-2xl bg-surface-container-low px-6 py-8 text-center">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant" aria-hidden>
            hourglass_top
          </span>
          <p className="mt-4 font-headline text-lg font-semibold text-on-background">
            {provisioningCopy.title}
          </p>
          <p className="mt-2 text-sm text-on-surface-variant">
            {provisioningCopy.body}
          </p>
          <Link
            href={provisioningCopy.ctaHref}
            className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
          >
            {provisioningCopy.ctaLabel}
          </Link>
        </div>
      </section>
    );
  }

  if (loaded.kind === 'no-workspaces') {
    return (
      <section className="space-y-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Dashboard</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Connectors</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Integrate GitHub and Slack with your startup workspace.
          </p>
        </div>
        <div className="rounded-2xl bg-surface-container-low px-6 py-8 text-center">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant" aria-hidden>
            cable
          </span>
          <p className="mt-4 font-headline text-lg font-semibold text-on-background">
            No startup workspace
          </p>
          <p className="mt-2 text-sm text-on-surface-variant">
            Connectors are only available to startup workspace members. Contact your GEO-Pulse admin to
            get access.
          </p>
        </div>
      </section>
    );
  }

  // ── Rollout blocked ──────────────────────────────────────────
  if (loaded.kind === 'rollout-blocked') {
    return (
      <section className="space-y-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Dashboard</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Connectors</h1>
        </div>
        <div className="rounded-2xl bg-surface-container-low px-6 py-8 text-center">
          <p className="font-headline text-lg font-semibold text-on-background">
            Connectors are not available for this workspace
          </p>
          <p className="mt-2 text-sm text-on-surface-variant">
            This feature is not enabled for{' '}
            <strong className="text-on-background">
              {loaded.selectedWorkspace?.name ?? 'your workspace'}
            </strong>
            . Contact your GEO-Pulse admin to enable connectors.
          </p>
        </div>
      </section>
    );
  }

  const { tabContext } = loaded;
  const {
    dashboard,
    selectedWorkspace,
    startupServiceGates,
    startupRolloutFlags,
    githubState,
    githubAllowlistValue,
    slackState,
    slackDestinations,
    slackActiveInstallations,
    slackActiveDestinations,
    canManageSlackAutoPost,
    slackDeliveryEvents,
  } = tabContext;

  const workspaceId = dashboard.selectedWorkspaceId ?? '';

  const workspaceMetadata = workspaceId
    ? await (async () => {
        const { data } = await supabase
          .from('startup_workspaces')
          .select('metadata')
          .eq('id', workspaceId)
          .maybeSingle();
        return (data?.metadata as Record<string, unknown> | null) ?? {};
      })()
    : {};
  const auditCadenceDays = typeof workspaceMetadata.audit_cadence_days === 'number'
    ? workspaceMetadata.audit_cadence_days
    : 30;

  const returnToConnectors = workspaceId
    ? `/dashboard/connectors?startupWorkspace=${workspaceId}`
    : '/dashboard/connectors';

  const githubEnabled = !!startupRolloutFlags?.githubAgent && !!startupServiceGates?.githubIntegration.enabled;
  const slackEnabled = !!startupRolloutFlags?.slackAgent && !!startupServiceGates?.slackIntegration.enabled;
  const githubConnected = githubState.installation?.status === 'connected';
  const slackConnected = slackActiveInstallations.length > 0;
  const slackAutoPostEnabled = !!startupRolloutFlags?.slackAutoPost;

  // Deep audit reports for push form
  const deepAuditReports = dashboard.reports
    .filter((r) => r.type === 'deep_audit')
    .slice(0, 10);

  return (
    <section className="space-y-6">

      {/* ── Page header ─────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Dashboard</p>
        <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Connectors</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Integrate GitHub and Slack to automate PR creation and deliver audit notifications.
          {selectedWorkspace ? (
            <span className="ml-2 font-medium text-on-background">
              Workspace: {selectedWorkspace.name}
            </span>
          ) : null}
        </p>
      </div>

      {/* ── OAuth return status banners ──────────────────────── */}
      {githubMsg ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            sp.github === 'success'
              ? 'bg-primary/10 text-primary'
              : 'bg-error/10 text-error'
          }`}
        >
          <span className="material-symbols-outlined mr-1.5 align-middle text-[16px]" aria-hidden>
            {sp.github === 'success' ? 'check_circle' : 'error'}
          </span>
          GitHub — {githubMsg}
        </div>
      ) : null}

      {slackMsg ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            sp.slack === 'success'
              ? 'bg-primary/10 text-primary'
              : 'bg-error/10 text-error'
          }`}
        >
          <span className="material-symbols-outlined mr-1.5 align-middle text-[16px]" aria-hidden>
            {sp.slack === 'success' ? 'check_circle' : 'error'}
          </span>
          Slack — {slackMsg}
        </div>
      ) : null}

      {/* ── GitHub connector card ────────────────────────────── */}
      <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low shadow-float">
        {/* Card header */}
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-outline-variant/10">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[24px] text-on-background" aria-hidden>
              code
            </span>
            <div>
              <h2 className="font-headline text-lg font-semibold text-on-background">GitHub</h2>
              <p className="text-sm text-on-surface-variant">
                Automate PR creation from scan recommendations
              </p>
            </div>
          </div>
          <StatusBadge status={githubConnected ? 'connected' : 'disconnected'} />
        </div>

        {/* Card body */}
        <div className="px-6 py-5">
          {!workspaceId ? (
            <p className="text-sm text-on-surface-variant">No workspace selected.</p>
          ) : !githubEnabled ? (
            <div className="rounded-xl bg-surface-container-lowest px-4 py-4 text-sm text-on-surface-variant">
              GitHub integration is not enabled for this workspace.
              {startupServiceGates?.githubIntegration.bundleKey ? (
                <span className="ml-1 font-mono text-xs">
                  (bundle: {startupServiceGates.githubIntegration.bundleKey})
                </span>
              ) : null}
              <br />
              Contact your GEO-Pulse admin to enable this feature.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Connection sub-card */}
              <div className="rounded-xl bg-surface-container-lowest px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  Connection
                </p>
                <div className="mt-3 space-y-1 text-sm">
                  <p className="text-on-surface-variant">
                    Status:{' '}
                    <strong className="text-on-background">
                      {githubState.installation?.status ?? 'disconnected'}
                    </strong>
                  </p>
                  {githubState.installation?.accountLogin ? (
                    <p className="text-on-surface-variant">
                      Account:{' '}
                      <strong className="text-on-background">
                        {githubState.installation.accountLogin}
                      </strong>
                    </p>
                  ) : null}
                  {githubState.installation?.installationId ? (
                    <p className="font-mono text-xs text-on-surface-variant">
                      ID: {githubState.installation.installationId}
                    </p>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={beginStartupGithubInstall}>
                    <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                    <button
                      type="submit"
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
                    >
                      {githubConnected ? 'Reconnect GitHub' : 'Connect GitHub'}
                    </button>
                  </form>
                  {githubState.installation ? (
                    <form action={disconnectStartupGithub}>
                      <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                      <button
                        type="submit"
                        className="rounded-xl border border-outline-variant/20 bg-surface-container-high px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface"
                      >
                        Disconnect
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>

              {/* Repo allowlist */}
              <div className="rounded-xl bg-surface-container-lowest px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  Repository allowlist
                </p>
                <p className="mt-2 text-xs text-on-surface-variant">
                  One <code>owner/repo</code> per line. Agent PR execution is limited to this list.
                </p>
                <form action={saveStartupGithubAllowlist} className="mt-3 space-y-2">
                  <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                  <textarea
                    name="repoAllowlist"
                    defaultValue={githubAllowlistValue}
                    rows={4}
                    className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 font-mono text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
                    placeholder={`acme/geo-pulse\nacme/marketing-site`}
                  />
                  {githubState.repositories.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {githubState.repositories.map((repo) => (
                        <span
                          key={repo.id}
                          className="rounded-lg bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary"
                        >
                          {repo.fullName}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <button
                    type="submit"
                    className="rounded-xl border border-outline-variant/20 bg-surface-container-high px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface"
                  >
                    Save allowlist
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Slack connector card ─────────────────────────────── */}
      <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low shadow-float">
        {/* Card header */}
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-outline-variant/10">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[24px] text-on-background" aria-hidden>
              chat
            </span>
            <div>
              <h2 className="font-headline text-lg font-semibold text-on-background">Slack</h2>
              <p className="text-sm text-on-surface-variant">
                Receive audit delivery notifications in your workspace
              </p>
            </div>
          </div>
          <StatusBadge status={slackConnected ? 'connected' : 'disconnected'} />
        </div>

        {/* Card body */}
        <div className="px-6 py-5">
          {!workspaceId ? (
            <p className="text-sm text-on-surface-variant">No workspace selected.</p>
          ) : !slackEnabled ? (
            <div className="rounded-xl bg-surface-container-lowest px-4 py-4 text-sm text-on-surface-variant">
              Slack integration is not enabled for this workspace.
              {startupServiceGates?.slackIntegration.bundleKey ? (
                <span className="ml-1 font-mono text-xs">
                  (bundle: {startupServiceGates.slackIntegration.bundleKey})
                </span>
              ) : null}
              <br />
              Contact your GEO-Pulse admin to enable this feature.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Connected workspaces */}
              <div className="rounded-xl bg-surface-container-lowest px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  Connected workspaces
                </p>
                {slackActiveInstallations.length === 0 ? (
                  <p className="mt-3 text-sm text-on-surface-variant">No Slack workspaces connected.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {slackActiveInstallations.map((inst) => (
                      <li
                        key={inst.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-container-low px-3 py-2.5"
                      >
                        <div className="text-sm">
                          <strong className="text-on-background">
                            {inst.slackTeamName ?? inst.slackTeamId}
                          </strong>
                          {inst.slackTeamDomain ? (
                            <span className="ml-1.5 text-xs text-on-surface-variant">
                              ({inst.slackTeamDomain})
                            </span>
                          ) : null}
                        </div>
                        <form action={disconnectStartupSlack}>
                          <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                          <input type="hidden" name="installationId" value={inst.id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-outline-variant/20 px-3 py-1 text-xs font-medium text-on-surface-variant transition hover:bg-surface-container-high"
                          >
                            Disconnect
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4">
                  <form action={beginStartupSlackInstall}>
                    <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                    <button
                      type="submit"
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
                    >
                      {slackConnected ? 'Add another workspace' : 'Connect Slack'}
                    </button>
                  </form>
                </div>
              </div>

              {/* Destination channels */}
              <div className="rounded-xl bg-surface-container-lowest px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  Destination channels
                </p>
                {slackActiveDestinations.length === 0 ? (
                  <p className="mt-3 text-sm text-on-surface-variant">
                    No destination channels configured yet.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1.5">
                    {slackActiveDestinations.map((dest) => (
                      <li
                        key={dest.id}
                        className="flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2 text-sm"
                      >
                        <span className="text-on-surface-variant">#</span>
                        <strong className="text-on-background">
                          {dest.channelName ?? dest.channelId}
                        </strong>
                        {dest.isDefaultDestination ? (
                          <span className="ml-auto rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            Default
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {/* Add channel form */}
                {slackActiveInstallations.length > 0 ? (
                  <form action={saveStartupSlackDestination} className="mt-4 space-y-2">
                    <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                    <input
                      type="hidden"
                      name="installationId"
                      value={slackActiveInstallations[0]?.id ?? ''}
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        name="channelId"
                        placeholder="Channel ID"
                        className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
                      />
                      <input
                        name="channelName"
                        placeholder="Channel name"
                        className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded-xl border border-outline-variant/20 bg-surface-container-high px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface"
                    >
                      Add channel
                    </button>
                  </form>
                ) : null}
              </div>

              {/* Recurring audits */}
              {canManageSlackAutoPost ? (
                <div className="rounded-xl bg-surface-container-lowest px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                    Recurring audits
                  </p>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    When enabled, GEO-Pulse automatically runs a new audit and posts results to your default Slack channel on the configured cadence.
                  </p>
                  <div className="mt-4 space-y-4">
                    {/* Auto-post toggle */}
                    <form action={updateStartupSlackAutoPostSetting} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                      <input type="hidden" name="returnTo" value={returnToConnectors} />
                      <label className="flex items-center gap-2 text-sm text-on-background">
                        <input
                          type="checkbox"
                          name="slackAutoPostEnabled"
                          defaultChecked={slackAutoPostEnabled}
                          className="h-4 w-4 rounded border-outline-variant accent-primary"
                        />
                        Enable recurring auto-scan + Slack delivery
                      </label>
                      <button
                        type="submit"
                        className="rounded-xl border border-outline-variant/20 bg-surface-container-high px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface"
                      >
                        Save
                      </button>
                    </form>
                    {/* Cadence selector */}
                    <form action={updateStartupAuditCadence} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                      <input type="hidden" name="returnTo" value={returnToConnectors} />
                      <div>
                        <label className="mb-1 block text-xs text-on-surface-variant">Scan cadence</label>
                        <select
                          name="cadenceDays"
                          defaultValue={String(auditCadenceDays)}
                          className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
                        >
                          <option value="7">Weekly (every 7 days)</option>
                          <option value="14">Bi-weekly (every 14 days)</option>
                          <option value="30">Monthly (every 30 days)</option>
                          <option value="60">Every 2 months</option>
                          <option value="90">Quarterly (every 90 days)</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="rounded-xl border border-outline-variant/20 bg-surface-container-high px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface"
                      >
                        Save cadence
                      </button>
                    </form>
                    {slackAutoPostEnabled ? (
                      <p className="rounded-xl bg-primary/5 px-4 py-3 text-xs text-on-surface-variant">
                        <span className="material-symbols-outlined mr-1.5 align-middle text-[14px] text-primary" aria-hidden>
                          check_circle
                        </span>
                        Auto-scan is active. Audits run every{' '}
                        <strong className="text-on-background">{auditCadenceDays} days</strong> and are
                        delivered to your default Slack channel. The next audit will be triggered
                        automatically by the platform.
                      </p>
                    ) : (
                      <p className="rounded-xl bg-surface-container-low px-4 py-3 text-xs text-on-surface-variant">
                        Auto-scan is disabled. Enable it above to start receiving automatic recurring audits.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Push report (notification) */}
              {slackActiveInstallations.length > 0 && slackActiveDestinations.length > 0 ? (
                <div className="rounded-xl bg-surface-container-lowest px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                    Push report to Slack
                  </p>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Send an audit summary notification to a channel. Includes score, delta, and top recommendations.
                  </p>
                  {deepAuditReports.length === 0 ? (
                    <p className="mt-3 rounded-xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
                      No deep audit reports yet. Run a deep audit to push results to Slack.
                    </p>
                  ) : (
                    <form action={sendStartupReportToSlack} className="mt-4 space-y-3">
                      <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                      <input type="hidden" name="returnTo" value={returnToConnectors} />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs text-on-surface-variant">Report</label>
                          <select
                            name="reportId"
                            className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
                          >
                            {deepAuditReports.map((r) => (
                              <option key={r.id} value={r.id}>
                                {new Date(r.createdAt).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                                {r.pdfUrl ? ' · PDF ready' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-on-surface-variant">Channel</label>
                          <select
                            name="destinationId"
                            className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
                          >
                            {slackActiveDestinations.map((d) => (
                              <option key={d.id} value={d.id}>
                                #{d.channelName ?? d.channelId}
                                {d.isDefaultDestination ? ' (default)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <input type="hidden" name="eventType" value="new_audit_ready" />
                      <button
                        type="submit"
                        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
                      >
                        Push notification
                      </button>
                    </form>
                  )}
                </div>
              ) : null}

              {/* Push full markdown as file */}
              {slackActiveInstallations.length > 0 && slackActiveDestinations.length > 0 ? (
                <div className="rounded-xl bg-surface-container-lowest px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                    Send full markdown report
                  </p>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Upload the complete audit markdown as a Slack file. The full report will appear inline in the channel.
                  </p>
                  {deepAuditReports.length === 0 ? (
                    <p className="mt-3 rounded-xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
                      No deep audit reports yet.
                    </p>
                  ) : (
                    <form action={sendStartupMarkdownToSlack} className="mt-4 space-y-3">
                      <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                      <input type="hidden" name="returnTo" value={returnToConnectors} />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs text-on-surface-variant">Report</label>
                          <select
                            name="reportId"
                            className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
                          >
                            {deepAuditReports.map((r) => (
                              <option key={r.id} value={r.id}>
                                {new Date(r.createdAt).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                                {r.pdfUrl ? ' · PDF ready' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-on-surface-variant">Channel</label>
                          <select
                            name="destinationId"
                            className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
                          >
                            {slackActiveDestinations.map((d) => (
                              <option key={d.id} value={d.id}>
                                #{d.channelName ?? d.channelId}
                                {d.isDefaultDestination ? ' (default)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="rounded-xl border border-outline-variant/20 bg-surface-container-high px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface"
                      >
                        Upload markdown to Slack
                      </button>
                    </form>
                  )}
                </div>
              ) : null}

              {/* Delivery log */}
              {slackDeliveryEvents.length > 0 ? (
                <div className="rounded-xl bg-surface-container-lowest px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                    Recent deliveries
                  </p>
                  <ul className="mt-3 space-y-2">
                    {slackDeliveryEvents.map((event) => {
                      const statusColors: Record<string, string> = {
                        sent: 'bg-primary/10 text-primary',
                        failed: 'bg-error/10 text-error',
                        skipped: 'bg-surface-container-high text-on-surface-variant',
                        queued: 'bg-warning/10 text-on-background',
                      };
                      const colorClass =
                        statusColors[event.status] ?? 'bg-surface-container-high text-on-surface-variant';
                      const eventDate = new Date(event.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      });
                      const siteDomain =
                        typeof event.payload.site_domain === 'string' ? event.payload.site_domain : '';
                      return (
                        <li
                          key={event.id}
                          className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-surface-container-low px-3 py-2.5 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-on-background">
                              {siteDomain || (event.eventType === 'plan_ready' ? 'Plan ready' : 'Audit ready')}
                            </p>
                            <p className="mt-0.5 text-on-surface-variant">{eventDate}</p>
                            {event.errorMessage ? (
                              <p className="mt-1 text-error">{event.errorMessage}</p>
                            ) : null}
                          </div>
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${colorClass}`}>
                            {event.status}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* ── Future placeholders ──────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {(['LinkedIn', 'Twitter / X'] as const).map((name) => (
          <div
            key={name}
            className="flex items-center gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container-lowest px-5 py-4 opacity-50"
          >
            <span className="material-symbols-outlined text-[24px] text-on-surface-variant" aria-hidden>
              public
            </span>
            <div>
              <p className="text-sm font-semibold text-on-surface-variant">{name}</p>
              <p className="text-xs text-on-surface-variant">Coming soon</p>
            </div>
          </div>
        ))}
      </div>

    </section>
  );
}
