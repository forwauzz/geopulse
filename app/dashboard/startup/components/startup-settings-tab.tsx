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
    return 'Blocked';
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

  const workspaceId = dashboard.selectedWorkspaceId;
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Settings</p>
            <h2 className="mt-1 text-lg font-semibold">Only the controls that need attention now</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Workspace identity stays readable here; rollout flags and lower-priority admin detail are collapsed below.
            </p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm">
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Bundle</p>
            <p className="mt-1 font-medium">{bundleKey ?? '—'}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Workspace</p>
            <p className="mt-1 font-medium text-on-surface">{selectedWorkspace?.name ?? '—'}</p>
            <p className="mt-1 text-xs text-on-surface-variant">{selectedWorkspace?.canonicalDomain ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Your role</p>
            <p className="mt-1 capitalize text-on-surface">{selectedWorkspace?.role ?? '—'}</p>
            <p className="mt-1 text-xs text-on-surface-variant">Key: {selectedWorkspace?.workspaceKey ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">GitHub service</p>
            <p className="mt-1 text-on-surface">{billingSummary(startupServiceGates?.githubIntegration)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Slack service</p>
            <p className="mt-1 text-on-surface">{billingSummary(startupServiceGates?.slackIntegration)}</p>
          </div>
        </div>
      </article>

      <article className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">GitHub integration</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Keep one connection and one allowlist. That is enough for this view.
            </p>
          </div>
          {githubStatusMessage ? (
            <p className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface">
              {githubStatusMessage}
            </p>
          ) : null}
        </div>

        {!workspaceId ? null : !startupRolloutFlags?.githubAgent ? (
          <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
            GitHub integration is disabled by rollout flags for this workspace.
          </div>
        ) : !startupServiceGates?.githubIntegration.enabled ? (
          <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
            GitHub integration is not available for this workspace bundle.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Connection</p>
              <p className="mt-2 text-sm">
                Status: <span className="font-semibold">{githubState.installation?.status ?? 'disconnected'}</span>
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Account: {githubState.installation?.accountLogin ?? '—'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={beginStartupGithubInstall}>
                  <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                  <button
                    type="submit"
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90"
                  >
                    {githubState.installation?.status === 'connected' ? 'Reconnect' : 'Connect GitHub'}
                  </button>
                </form>
                {githubState.installation ? (
                  <form action={disconnectStartupGithub}>
                    <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
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
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Allowlist</p>
              <p className="mt-2 text-xs text-on-surface-variant">
                One <code>owner/repo</code> per line.
              </p>
              <form action={saveStartupGithubAllowlist} className="mt-3 space-y-2">
                <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                <textarea
                  name="repoAllowlist"
                  defaultValue={githubAllowlistValue}
                  rows={4}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Slack integration</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Keep delivery simple: connect, choose a destination, and decide whether auto-post stays off.
            </p>
          </div>
          {slackStatusMessage ? (
            <p className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface">
              {slackStatusMessage}
            </p>
          ) : null}
        </div>

        {!workspaceId ? null : !startupRolloutFlags?.slackAgent ? (
          <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
            Slack integration is disabled by rollout flags for this workspace.
          </div>
        ) : !startupServiceGates?.slackIntegration.enabled ? (
          <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
            Slack integration is not available for this workspace bundle.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Connection</p>
              <p className="mt-2 text-xs text-on-surface-variant">Connect one or more Slack workspaces.</p>
              <form action={beginStartupSlackInstall} className="mt-3">
                <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90"
                >
                  Connect Slack
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Auto-post</p>
              <p className="mt-2 text-xs text-on-surface-variant">
                Keep this off unless the team wants automated Slack posting.
              </p>
              {canManageSlackAutoPost ? (
                <form action={updateStartupSlackAutoPostSetting} className="mt-3 space-y-2">
                  <input type="hidden" name="startupWorkspaceId" value={workspaceId ?? ''} />
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
                    Save setting
                  </button>
                </form>
              ) : (
                <p className="mt-3 text-xs text-on-surface-variant">Founder or admin role required to change this.</p>
              )}
            </div>
          </div>
        )}
      </article>

      <details className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2">
        <summary className="cursor-pointer list-none text-lg font-semibold text-on-surface">
          Advanced details
          <span className="ml-3 text-sm font-normal text-on-surface-variant">Rollout flags, connected workspaces, and destinations</span>
        </summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Rollout flags</p>
            {startupRolloutFlags ? (
              <ul className="mt-2 grid gap-1 text-xs text-on-surface sm:grid-cols-2">
                <li>startup_dashboard: {rolloutLabel(startupRolloutFlags.startupDashboard)}</li>
                <li>github_agent: {rolloutLabel(startupRolloutFlags.githubAgent)}</li>
                <li>auto_pr: {rolloutLabel(startupRolloutFlags.autoPr)}</li>
                <li>slack_agent: {rolloutLabel(startupRolloutFlags.slackAgent)}</li>
                <li>slack_auto_post: {rolloutLabel(startupRolloutFlags.slackAutoPost)}</li>
              </ul>
            ) : (
              <p className="mt-2 text-xs text-on-surface-variant">Rollout flags not loaded for this view.</p>
            )}
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Slack destinations</p>
            {slackDestinations.length === 0 ? (
              <p className="mt-2 text-sm text-on-surface-variant">No destination channels configured yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-on-surface">
                {slackDestinations.map((destination) => (
                  <li key={destination.id} className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2">
                    <p className="font-medium">{destination.channelName ?? destination.channelId}</p>
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
                <input type="hidden" name="startupWorkspaceId" value={workspaceId ?? ''} />
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
      </details>
    </>
  );
}
