import { redirect } from 'next/navigation';
import {
  beginStartupGithubInstall,
  beginStartupSlackInstall,
  disconnectStartupGithub,
  disconnectStartupSlack,
  saveStartupGithubAllowlist,
  saveStartupSlackDestination,
  updateStartupSlackAutoPostSetting,
} from '@/app/dashboard/startup/actions';
import { loadStartupDashboardContext } from '@/app/dashboard/startup/lib/load-startup-dashboard-context';
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

  const loaded = await loadStartupDashboardContext({
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
  } = tabContext;

  const workspaceId = dashboard.selectedWorkspaceId ?? '';
  const githubEnabled = !!startupRolloutFlags?.githubAgent && !!startupServiceGates?.githubIntegration.enabled;
  const slackEnabled = !!startupRolloutFlags?.slackAgent && !!startupServiceGates?.slackIntegration.enabled;
  const githubConnected = githubState.installation?.status === 'connected';
  const slackConnected = slackActiveInstallations.length > 0;

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

              {/* Auto-post toggle */}
              {canManageSlackAutoPost ? (
                <div className="rounded-xl bg-surface-container-lowest px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                    Auto-post
                  </p>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Automatically post audit results to the default Slack destination when a report is delivered.
                  </p>
                  <form action={updateStartupSlackAutoPostSetting} className="mt-3 flex items-center gap-3">
                    <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                    <label className="flex items-center gap-2 text-sm text-on-background">
                      <input
                        type="checkbox"
                        name="slackAutoPostEnabled"
                        className="h-4 w-4 rounded border-outline-variant accent-primary"
                      />
                      Enable auto-post
                    </label>
                    <button
                      type="submit"
                      className="rounded-xl border border-outline-variant/20 bg-surface-container-high px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface"
                    >
                      Save
                    </button>
                  </form>
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
