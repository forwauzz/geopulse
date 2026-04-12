import Link from 'next/link';
import { sendStartupReportToSlack } from '@/app/dashboard/startup/actions';
import type { StartupDeliveryTabProps } from './startup-tab-types';

function settingsTabHref(workspaceId: string | null): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set('startupWorkspace', workspaceId);
  params.set('tab', 'settings');
  const query = params.toString();
  return query ? `/dashboard/startup?${query}` : '/dashboard/startup';
}

function auditsTabHref(workspaceId: string | null): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set('startupWorkspace', workspaceId);
  params.set('tab', 'audits');
  const query = params.toString();
  return `/dashboard/startup?${query}`;
}

function newScanHref(workspaceId: string | null): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set('startupWorkspace', workspaceId);
  const query = params.toString();
  return query ? `/dashboard/new-scan?${query}` : '/dashboard/new-scan';
}

export function StartupDeliveryTab({
  dashboard,
  startupRolloutFlags,
  startupServiceGates,
  deliveredReports,
  slackActiveDestinations,
  slackDeliveryEvents,
  slackStatusMessage,
}: StartupDeliveryTabProps) {
  const workspaceId = dashboard.selectedWorkspaceId;
  const canSend =
    !!workspaceId &&
    !!startupRolloutFlags?.slackAgent &&
    !!startupServiceGates?.slackIntegration.enabled &&
    !!startupServiceGates?.slackNotifications.enabled;

  const hasDestinations = slackActiveDestinations.length > 0;

  return (
    <>
      <article
        data-testid="startup-delivery-tab"
        className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Delivery</p>
            <h2 className="mt-1 text-lg font-semibold">Slack delivery at a glance</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Keep delivery state visible, with manual send and auto-post controls close together.
            </p>
          </div>
          <Link
            href={settingsTabHref(workspaceId)}
            className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-surface-container-high"
          >
            Configure delivery
          </Link>
        </div>

        {slackStatusMessage ? (
          <p className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface">
            {slackStatusMessage}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Deep audits</p>
            <p className="mt-1 text-2xl font-bold">{dashboard.reports.length}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Delivered</p>
            <p className="mt-1 text-2xl font-bold">{deliveredReports}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Auto-post</p>
            <p className="mt-1 text-2xl font-bold">{startupRolloutFlags?.slackAutoPost ? 'On' : 'Off'}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Primary action</p>
            {dashboard.reports.length === 0 ? (
              <p
                data-testid="startup-delivery-empty-reports"
                className="mt-3 rounded-lg border border-dashed border-outline-variant bg-surface-container px-3 py-3 text-sm text-on-surface-variant"
              >
                No deep audit reports yet. Once a report exists, you can send it to Slack here or from the audits tab.
              </p>
            ) : null}
            {canSend ? (
              <form action={sendStartupReportToSlack} className="mt-3 grid gap-2">
                <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                <select
                  name="reportId"
                  className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                  defaultValue={dashboard.reports[0]?.id ?? ''}
                >
                  {dashboard.reports.length === 0 ? (
                    <option value="">No reports available</option>
                  ) : (
                    dashboard.reports.map((report) => (
                      <option key={report.id} value={report.id}>
                        {report.type} · {new Date(report.createdAt).toLocaleDateString()}
                      </option>
                    ))
                  )}
                </select>
                <select
                  name="destinationId"
                  className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                  defaultValue={slackActiveDestinations[0]?.id ?? ''}
                >
                  {hasDestinations ? (
                    slackActiveDestinations.map((destination) => (
                      <option key={destination.id} value={destination.id}>
                        {destination.channelName ?? destination.channelId}
                      </option>
                    ))
                  ) : (
                    <option value="">No active Slack destinations</option>
                  )}
                </select>
                <select
                  name="eventType"
                  className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                  defaultValue="new_audit_ready"
                >
                  <option value="new_audit_ready">new_audit_ready</option>
                  <option value="plan_ready">plan_ready</option>
                </select>
                <button
                  type="submit"
                  data-testid="startup-push-to-slack-button"
                  disabled={dashboard.reports.length === 0 || !hasDestinations}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Push to Slack
                </button>
              </form>
            ) : (
              <p className="mt-3 text-xs text-on-surface-variant">
                {!startupRolloutFlags?.slackAgent
                  ? 'Slack delivery is disabled by rollout flags for this workspace.'
                  : !startupServiceGates?.slackIntegration.enabled || !startupServiceGates?.slackNotifications.enabled
                  ? 'Slack delivery requires Slack integration and notifications to be enabled for this workspace.'
                  : 'Select a workspace to send Slack delivery.'}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Setup status</p>
              <Link href={settingsTabHref(workspaceId)} className="text-xs font-semibold text-primary underline">
                Fix in Settings
              </Link>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <p className="rounded-lg bg-surface-container-low px-3 py-2 text-on-surface-variant">
                Active destinations: {slackActiveDestinations.length}
              </p>
              <p className="rounded-lg bg-surface-container-low px-3 py-2 text-on-surface-variant">
                Auto-post is {startupRolloutFlags?.slackAutoPost ? 'enabled' : 'disabled'}
              </p>
              <p className="rounded-lg bg-surface-container-low px-3 py-2 text-on-surface-variant">
                Audit history lives in the Audits tab.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={auditsTabHref(workspaceId)}
                className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
              >
                Review audits
              </Link>
              <Link
                href={newScanHref(workspaceId)}
                className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
              >
                Start a new scan
              </Link>
            </div>
          </div>
        </div>
      </article>

      <details className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2">
        <summary className="cursor-pointer list-none text-lg font-semibold text-on-surface">
          Recent delivery attempts
          <span className="ml-3 text-sm font-normal text-on-surface-variant">Latest Slack events, kept out of the main flow</span>
        </summary>
        {slackDeliveryEvents.length === 0 ? (
          <p className="mt-4 text-sm text-on-surface-variant">No Slack delivery attempts yet.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm text-on-surface">
            {slackDeliveryEvents.map((event) => (
              <li key={event.id} className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2">
                <p className="font-medium text-on-surface">
                  {event.eventType} · {event.status}
                </p>
                <p className="text-xs text-on-surface-variant">
                  {new Date(event.createdAt).toLocaleString()}
                  {event.errorMessage ? ` · ${event.errorMessage}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </details>
    </>
  );
}
