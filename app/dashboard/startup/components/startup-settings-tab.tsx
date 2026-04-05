import {
  beginStartupGithubInstall,
  beginStartupSlackInstall,
  disconnectStartupGithub,
  disconnectStartupSlack,
  saveStartupGithubAllowlist,
  saveStartupSlackDestination,
  updateStartupSlackAutoPostSetting,
} from '@/app/dashboard/startup/actions';
import type { StartupServiceGate } from '@/lib/server/startup-service-gates';
import type { StartupSettingsTabProps } from './startup-tab-types';

function rolloutLabel(on: boolean | undefined): string {
  return on ? 'On' : 'Off';
}

function billingSummary(gate: StartupServiceGate | null | undefined): string {
  if (!gate) return '—';
  if (gate.enabled) return 'Available';
  const reason = gate.blockedReason;
  if (
    reason === 'workspace_requires_paid_mode' ||
    reason === 'stripe_mapping_missing' ||
    reason === 'stripe_mapping_inactive'
  ) {
    return 'Blocked (billing configuration)';
  }
  return reason ? `Blocked (${String(reason)})` : 'Blocked';
}

export function StartupSettingsTab(props: StartupSettingsTabProps) {
  const {
    dashboard,
    selectedWorkspace,
    startupRolloutFlags,
    startupServiceGates,
    githubState,
    githubAllowlistValue,
    githubStatusMessage,
    slackStatusMessage,
    slackState,
    slackDestinations,
    slackActiveInstallations,
    canManageSlackAutoPost,
  } = props;

  const bundleKey =
    startupServiceGates?.githubIntegration.bundleKey ??
    startupServiceGates?.slackIntegration.bundleKey ??
    null;

  return (
    <>
      <article
        data-testid="startup-settings-tab"
        className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2"
      >
        <h2 className="text-lg font-semibold">Workspace</h2>
        <p className="mt-1 text-sm text-on-surface-variant">Read-only context for this startup workspace.</p>
        <div className="mt-4 grid gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Name</p>
            <p className="mt-1 font-medium text-on-surface">{selectedWorkspace?.name ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Workspace key</p>
            <p className="mt-1 font-mono text-xs text-on-surface">{selectedWorkspace?.workspaceKey ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Canonical domain</p>
            <p className="mt-1 text-on-surface">{selectedWorkspace?.canonicalDomain ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Your role</p>
            <p className="mt-1 capitalize text-on-surface">{selectedWorkspace?.role ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Bundle</p>
            <p className="mt-1 font-medium text-on-surface">{bundleKey ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">GitHub service</p>
            <p className="mt-1 text-on-surface">{billingSummary(startupServiceGates?.githubIntegration)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Slack integration service</p>
            <p className="mt-1 text-on-surface">{billingSummary(startupServiceGates?.slackIntegration)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Slack notifications</p>
            <p className="mt-1 text-on-surface">{billingSummary(startupServiceGates?.slackNotifications)}</p>
          </div>
        </div>
        {startupRolloutFlags ? (
          <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4">
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Rollout flags</p>
            <ul className="mt-2 grid gap-1 text-xs text-on-surface sm:grid-cols-2">
              <li>startup_dashboard: {rolloutLabel(startupRolloutFlags.startupDashboard)}</li>
              <li>github_agent: {rolloutLabel(startupRolloutFlags.githubAgent)}</li>
              <li>auto_pr: {rolloutLabel(startupRolloutFlags.autoPr)}</li>
              <li>slack_agent: {rolloutLabel(startupRolloutFlags.slackAgent)}</li>
              <li>slack_auto_post: {rolloutLabel(startupRolloutFlags.slackAutoPost)}</li>
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-xs text-on-surface-variant">Rollout flags not loaded for this view.</p>
        )}
      </article>

      <article className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2">
        <h2 className="text-lg font-semibold">GitHub integration</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Connect one GitHub App installation and keep an explicit repo allowlist for agent execution scope.
        </p>
        {githubStatusMessage ? (
          <p className="mt-3 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface">
            {githubStatusMessage}
          </p>
        ) : null}
        {!dashboard.selectedWorkspaceId ? null : !startupRolloutFlags?.githubAgent ? (
          <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
            GitHub integration is currently disabled by rollout flags for this workspace.
          </div>
        ) : !startupServiceGates?.githubIntegration.enabled ? (
          <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
            {startupServiceGates?.githubIntegration.blockedReason === 'workspace_requires_paid_mode' ||
            startupServiceGates?.githubIntegration.blockedReason === 'stripe_mapping_missing' ||
            startupServiceGates?.githubIntegration.blockedReason === 'stripe_mapping_inactive'
              ? 'GitHub integration is currently blocked by billing configuration for this workspace.'
              : 'GitHub integration is disabled for this workspace bundle.'}
            <br />
            Bundle:{' '}
            <span className="font-medium text-on-surface">
              {startupServiceGates?.githubIntegration.bundleKey ?? 'unknown'}
            </span>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Connection</p>
              <p className="mt-2 text-sm">
                Status:{' '}
                <span className="font-semibold text-on-surface">
                  {githubState.installation?.status ?? 'disconnected'}
                </span>
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Installation ID: {githubState.installation?.installationId ?? '-'}
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">Account: {githubState.installation?.accountLogin ?? '-'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={beginStartupGithubInstall}>
                  <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                  <button
                    type="submit"
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90"
                  >
                    {githubState.installation?.status === 'connected' ? 'Reconnect GitHub' : 'Connect GitHub'}
                  </button>
                </form>
                {githubState.installation ? (
                  <form action={disconnectStartupGithub}>
                    <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                    <button
                      type="submit"
                      className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
                    >
                      Disconnect
                    </button>
                  </form>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Repository allowlist</p>
              <p className="mt-2 text-xs text-on-surface-variant">
                One <code>owner/repo</code> per line. Agent PR execution is limited to this list.
              </p>
              <form action={saveStartupGithubAllowlist} className="mt-3 space-y-2">
                <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                <textarea
                  name="repoAllowlist"
                  defaultValue={githubAllowlistValue}
                  rows={5}
                  className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface outline-none ring-emerald-300/40 transition focus:ring"
                  placeholder="acme/geo-pulse&#10;acme/marketing-site"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
                >
                  Save allowlist
                </button>
              </form>
            </div>
          </div>
        )}
      </article>

      <article className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2">
        <h2 className="text-lg font-semibold">Slack integration</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Connect Slack workspaces and map delivery channels for startup reports.
        </p>
        {slackStatusMessage ? (
          <p className="mt-3 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface">
            {slackStatusMessage}
          </p>
        ) : null}
        {!dashboard.selectedWorkspaceId ? null : !startupRolloutFlags?.slackAgent ? (
          <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
            Slack integration is currently disabled by rollout flags for this workspace.
          </div>
        ) : !startupServiceGates?.slackIntegration.enabled ? (
          <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
            {startupServiceGates?.slackIntegration.blockedReason === 'workspace_requires_paid_mode' ||
            startupServiceGates?.slackIntegration.blockedReason === 'stripe_mapping_missing' ||
            startupServiceGates?.slackIntegration.blockedReason === 'stripe_mapping_inactive'
              ? 'Slack integration is currently blocked by billing configuration for this workspace.'
              : 'Slack integration is disabled for this workspace bundle.'}
            <br />
            Bundle:{' '}
            <span className="font-medium text-on-surface">
              {startupServiceGates?.slackIntegration.bundleKey ?? 'unknown'}
            </span>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Connection</p>
              <p className="mt-2 text-xs text-on-surface-variant">
                Connect one or more Slack workspaces. Channel destination setup comes next.
              </p>
              <form action={beginStartupSlackInstall} className="mt-3">
                <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90"
                >
                  Connect Slack
                </button>
              </form>
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Auto-post mode</p>
              <p className="mt-2 text-xs text-on-surface-variant">
                Keep this off by default. Enable only when your team wants automatic Slack posting in later slices.
              </p>
              {canManageSlackAutoPost ? (
                <form action={updateStartupSlackAutoPostSetting} className="mt-3 space-y-2">
                  <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId ?? ''} />
                  <label className="flex items-center gap-2 text-xs text-on-surface">
                    <input
                      type="checkbox"
                      name="slackAutoPostEnabled"
                      defaultChecked={startupRolloutFlags?.slackAutoPost ?? false}
                      className="h-4 w-4 rounded border-outline-variant"
                    />
                    Enable workspace Slack auto-post
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
                  >
                    Save auto-post setting
                  </button>
                </form>
              ) : (
                <p className="mt-3 text-xs text-on-surface-variant">
                  Founder or admin role required to change auto-post mode.
                </p>
              )}
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Connected workspaces</p>
              {slackState.installations.length === 0 ? (
                <p className="mt-2 text-sm text-on-surface-variant">No Slack workspaces connected yet.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm text-on-surface">
                  {slackState.installations.map((installation) => (
                    <li
                      key={installation.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container px-3 py-2"
                    >
                      <div>
                        <p className="font-medium text-on-surface">
                          {installation.slackTeamName ?? installation.slackTeamId}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          Team ID: {installation.slackTeamId}
                          {installation.slackTeamDomain ? ` · ${installation.slackTeamDomain}.slack.com` : ''}
                          {` · ${installation.status}`}
                        </p>
                      </div>
                      {installation.status === 'active' ? (
                        <form action={disconnectStartupSlack}>
                          <input
                            type="hidden"
                            name="startupWorkspaceId"
                            value={dashboard.selectedWorkspaceId ?? ''}
                          />
                          <input type="hidden" name="installationId" value={installation.id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
                          >
                            Disconnect
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Destination channels</p>
              {slackDestinations.length === 0 ? (
                <p className="mt-2 text-sm text-on-surface-variant">No destination channels configured yet.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm text-on-surface">
                  {slackDestinations.map((destination) => (
                    <li
                      key={destination.id}
                      className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2"
                    >
                      <p className="font-medium text-on-surface">
                        {destination.channelName ?? destination.channelId}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        Channel ID: {destination.channelId}
                        {destination.isDefaultDestination ? ' · default' : ''}
                        {` · ${destination.status}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {slackActiveInstallations.length > 0 ? (
                <form action={saveStartupSlackDestination} className="mt-4 grid gap-2 md:grid-cols-2">
                  <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId ?? ''} />
                  <label className="text-xs text-on-surface-variant">
                    Workspace
                    <select
                      name="installationId"
                      className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                      defaultValue={slackActiveInstallations[0]?.id ?? ''}
                    >
                      {slackActiveInstallations.map((installation) => (
                        <option key={installation.id} value={installation.id}>
                          {installation.slackTeamName ?? installation.slackTeamId}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-on-surface-variant">
                    Channel ID
                    <input
                      name="channelId"
                      placeholder="C0123456789"
                      className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                    />
                  </label>
                  <label className="text-xs text-on-surface-variant md:col-span-2">
                    Channel name (optional)
                    <input
                      name="channelName"
                      placeholder="#geo-audits"
                      className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-on-surface md:col-span-2">
                    <input type="checkbox" name="isDefaultDestination" className="h-4 w-4 rounded border-outline-variant" />
                    Set as default Slack destination
                  </label>
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
                    >
                      Save destination
                    </button>
                  </div>
                </form>
              ) : (
                <p className="mt-3 text-xs text-on-surface-variant">
                  Connect at least one active Slack workspace before adding destination channels.
                </p>
              )}
            </div>
          </div>
        )}
      </article>
    </>
  );
}
