import {
  beginStartupSlackInstall,
  disconnectStartupSlack,
  saveStartupSlackDestination,
  sendStartupMarkdownToSlack,
  sendStartupReportToSlack,
  updateStartupAuditCadence,
  updateStartupSlackAutoPostSetting,
} from '@/app/dashboard/startup/actions';
import { ConnectorStatusBadge } from '@/app/dashboard/connectors/components/connector-status-badge';

type Installation = {
  readonly id: string;
  readonly slackTeamName?: string | null;
  readonly slackTeamId?: string | null;
  readonly slackTeamDomain?: string | null;
};

type Destination = {
  readonly id: string;
  readonly channelName?: string | null;
  readonly channelId?: string | null;
  readonly isDefaultDestination?: boolean | null;
};

type Report = {
  readonly id: string;
  readonly createdAt: string;
  readonly pdfUrl?: string | null;
};

type DeliveryEvent = {
  readonly id: string;
  readonly status: string;
  readonly eventType: string;
  readonly createdAt: string;
  readonly errorMessage?: string | null;
  readonly payload: Record<string, unknown>;
};

type Props = {
  readonly workspaceId: string;
  readonly returnToConnectors: string;
  readonly slackEnabled: boolean;
  readonly bundleKey?: string | null;
  readonly slackActiveInstallations: readonly Installation[];
  readonly slackActiveDestinations: readonly Destination[];
  readonly slackConnected: boolean;
  readonly canManageSlackAutoPost: boolean;
  readonly slackAutoPostEnabled: boolean;
  readonly auditCadenceDays: number;
  readonly auditScheduleDate: string;
  readonly auditScheduleTime: string;
  readonly auditScheduleTimezone: string;
  readonly deepAuditReports: readonly Report[];
  readonly slackDeliveryEvents: readonly DeliveryEvent[];
};

export function SlackConnectorPanel({
  workspaceId,
  returnToConnectors,
  slackEnabled,
  bundleKey,
  slackActiveInstallations,
  slackActiveDestinations,
  slackConnected,
  canManageSlackAutoPost,
  slackAutoPostEnabled,
  auditCadenceDays,
  auditScheduleDate,
  auditScheduleTime,
  auditScheduleTimezone,
  deepAuditReports,
  slackDeliveryEvents,
}: Props) {
  const firstInstall = slackActiveInstallations[0];

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container-lowest shadow-float">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant/10 px-6 py-5">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container-low text-primary"
            aria-hidden
          >
            <span className="material-symbols-outlined text-[26px]">chat</span>
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-headline text-lg font-semibold text-on-background">Slack</h2>
              <ConnectorStatusBadge status={slackConnected ? 'connected' : 'disconnected'} />
            </div>
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-on-surface-variant">
              Deliver audit notifications, optional recurring scan results, and on-demand report pushes to channels you
              choose in your Slack workspace.
            </p>
          </div>
        </div>
        {workspaceId && slackEnabled && slackActiveInstallations.length === 1 ? (
          <form action={disconnectStartupSlack} className="shrink-0">
            <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
            <input type="hidden" name="installationId" value={slackActiveInstallations[0]!.id} />
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
        ) : !slackEnabled ? (
          <div className="rounded-xl bg-surface-container-low px-4 py-4 text-sm text-on-surface-variant">
            Slack integration is not enabled for this workspace.
            {bundleKey ? <span className="ml-1 font-mono text-xs">(bundle: {bundleKey})</span> : null}
            <br />
            Contact your GEO-Pulse admin to enable this feature.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low px-4 py-4">
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
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-container-lowest px-3 py-2.5"
                    >
                      <div className="text-sm">
                        <strong className="text-on-background">{inst.slackTeamName ?? inst.slackTeamId}</strong>
                        {inst.slackTeamDomain ? (
                          <span className="ml-1.5 text-xs text-on-surface-variant">({inst.slackTeamDomain})</span>
                        ) : null}
                      </div>
                      {slackActiveInstallations.length > 1 ? (
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
                      ) : null}
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

            <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                Destination channels
              </p>
              {slackActiveDestinations.length === 0 ? (
                <p className="mt-3 text-sm text-on-surface-variant">No destination channels configured yet.</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {slackActiveDestinations.map((dest) => (
                    <li
                      key={dest.id}
                      className="flex items-center gap-2 rounded-lg bg-surface-container-lowest px-3 py-2 text-sm"
                    >
                      <span className="text-on-surface-variant">#</span>
                      <strong className="text-on-background">{dest.channelName ?? dest.channelId}</strong>
                      {dest.isDefaultDestination ? (
                        <span className="ml-auto rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          Default
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {slackActiveInstallations.length > 0 ? (
                <form action={saveStartupSlackDestination} className="mt-4 space-y-2">
                  <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                  <input type="hidden" name="installationId" value={firstInstall?.id ?? ''} />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      name="channelId"
                      placeholder="Channel ID"
                      className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
                    />
                    <input
                      name="channelName"
                      placeholder="Channel name"
                      className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
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

            {canManageSlackAutoPost ? (
              <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  Recurring audits
                </p>
                <p className="mt-2 text-sm text-on-surface-variant">
                  When enabled, GEO-Pulse automatically runs a new audit and posts results to your default Slack channel
                  on the configured cadence.
                </p>
                <div className="mt-4 space-y-4">
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
                  <form action={updateStartupAuditCadence} className="grid gap-3 lg:grid-cols-4">
                    <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                    <input type="hidden" name="returnTo" value={returnToConnectors} />
                    <div>
                      <label className="mb-1 block text-xs text-on-surface-variant">Scan cadence</label>
                      <select
                        name="cadenceDays"
                        defaultValue={String(auditCadenceDays)}
                        className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
                      >
                        <option value="7">Weekly (every 7 days)</option>
                        <option value="14">Bi-weekly (every 14 days)</option>
                        <option value="30">Monthly (every 30 days)</option>
                        <option value="60">Every 2 months</option>
                        <option value="90">Quarterly (every 90 days)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-on-surface-variant">Start date</label>
                      <input
                        type="date"
                        name="scheduleDate"
                        defaultValue={auditScheduleDate}
                        className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-on-surface-variant">Start time</label>
                      <input
                        type="time"
                        name="scheduleTime"
                        defaultValue={auditScheduleTime}
                        className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-on-surface-variant">Time zone</label>
                      <input
                        type="text"
                        name="scheduleTimezone"
                        defaultValue={auditScheduleTimezone}
                        className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
                        placeholder="UTC or America/Toronto"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-high px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface"
                      >
                        Save cadence
                      </button>
                    </div>
                  </form>
                  <p className="text-xs text-on-surface-variant">
                    Optional start date/time lets you anchor the first recurring audit run to a specific schedule.
                  </p>
                  {slackAutoPostEnabled ? (
                    <p className="rounded-xl bg-primary/5 px-4 py-3 text-xs text-on-surface-variant">
                      <span className="material-symbols-outlined mr-1.5 align-middle text-[14px] text-primary" aria-hidden>
                        check_circle
                      </span>
                      Auto-scan is active. Audits run every{' '}
                      <strong className="text-on-background">{auditCadenceDays} days</strong> and are delivered to your
                      default Slack channel.
                    </p>
                  ) : (
                    <p className="rounded-xl bg-surface-container-low px-4 py-3 text-xs text-on-surface-variant">
                      Auto-scan is disabled. Enable it above to start receiving automatic recurring audits.
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            {slackActiveInstallations.length > 0 && slackActiveDestinations.length > 0 ? (
              <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  Push report to Slack
                </p>
                <p className="mt-2 text-sm text-on-surface-variant">
                  Send an audit summary notification to a channel. Includes score, delta, and top recommendations.
                </p>
                {deepAuditReports.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-surface-container-lowest px-4 py-3 text-sm text-on-surface-variant">
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
                          className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
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
                          className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
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

            {slackActiveInstallations.length > 0 && slackActiveDestinations.length > 0 ? (
              <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  Send full markdown report
                </p>
                <p className="mt-2 text-sm text-on-surface-variant">
                  Upload the complete audit markdown as a Slack file. The full report will appear inline in the channel.
                </p>
                {deepAuditReports.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-surface-container-lowest px-4 py-3 text-sm text-on-surface-variant">
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
                          className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
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
                          className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface outline-none transition focus:ring-1 focus:ring-primary/40"
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

            {slackDeliveryEvents.length > 0 ? (
              <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low px-4 py-4">
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
                    const siteDomain = typeof event.payload.site_domain === 'string' ? event.payload.site_domain : '';
                    return (
                      <li
                        key={event.id}
                        className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-surface-container-lowest px-3 py-2.5 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-on-background">
                            {siteDomain || (event.eventType === 'plan_ready' ? 'Plan ready' : 'Audit ready')}
                          </p>
                          <p className="mt-0.5 text-on-surface-variant">{eventDate}</p>
                          {event.errorMessage ? <p className="mt-1 text-error">{event.errorMessage}</p> : null}
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
  );
}
