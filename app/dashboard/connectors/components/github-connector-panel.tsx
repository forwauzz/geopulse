import {
  beginStartupGithubInstall,
  disconnectStartupGithub,
  saveStartupGithubAllowlist,
} from '@/app/dashboard/startup/actions';
import { ConnectorStatusBadge } from '@/app/dashboard/connectors/components/connector-status-badge';
import type { StartupGithubIntegrationState } from '@/lib/server/startup-github-integration';

type Props = {
  readonly workspaceId: string;
  readonly githubEnabled: boolean;
  readonly bundleKey?: string | null;
  readonly githubState: StartupGithubIntegrationState;
  readonly githubAllowlistValue: string;
  readonly githubConnected: boolean;
};

export function GithubConnectorPanel({
  workspaceId,
  githubEnabled,
  bundleKey,
  githubState,
  githubAllowlistValue,
  githubConnected,
}: Props) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container-lowest shadow-float">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant/10 px-6 py-5">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container-low text-primary"
            aria-hidden
          >
            <span className="material-symbols-outlined text-[26px]">code</span>
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-headline text-lg font-semibold text-on-background">GitHub</h2>
              <ConnectorStatusBadge status={githubConnected ? 'connected' : 'disconnected'} />
            </div>
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-on-surface-variant">
              Connect a GitHub App installation so GEO-Pulse can open pull requests from scan recommendations. Scope
              automation with a repository allowlist.
            </p>
          </div>
        </div>
        {workspaceId && githubEnabled && githubState.installation ? (
          <form action={disconnectStartupGithub} className="shrink-0">
            <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
            <button
              type="submit"
              className="rounded-xl border border-outline-variant/25 bg-surface-container-low px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface-container-high"
            >
              Disconnect
            </button>
          </form>
        ) : null}
      </header>

      <div className="px-6 py-6">
        {!workspaceId ? (
          <p className="text-sm text-on-surface-variant">No workspace selected.</p>
        ) : !githubEnabled ? (
          <div className="rounded-xl bg-surface-container-low px-4 py-4 text-sm text-on-surface-variant">
            GitHub integration is not enabled for this workspace.
            {bundleKey ? <span className="ml-1 font-mono text-xs">(bundle: {bundleKey})</span> : null}
            <br />
            Contact your GEO-Pulse admin to enable this feature.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Connection</p>
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
                    <strong className="text-on-background">{githubState.installation.accountLogin}</strong>
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
              </div>
            </div>

            <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low px-4 py-4">
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
                  className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 font-mono text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
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
  );
}
