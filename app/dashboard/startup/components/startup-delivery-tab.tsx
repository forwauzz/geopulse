import Link from 'next/link';
import { sendStartupReportToSlack } from '@/app/dashboard/startup/actions';
import type { StartupDeliveryTabProps } from './startup-tab-types';

function settingsTabHref(workspaceId: string | null): string {
  const p = new URLSearchParams();
  if (workspaceId) p.set('startupWorkspace', workspaceId);
  p.set('tab', 'settings');
  const q = p.toString();
  return q ? `/dashboard/startup?${q}` : '/dashboard/startup';
}

function auditsTabHref(workspaceId: string | null): string {
  const p = new URLSearchParams();
  if (workspaceId) p.set('startupWorkspace', workspaceId);
  p.set('tab', 'audits');
  const q = p.toString();
  return `/dashboard/startup?${q}`;
}

function newScanHref(workspaceId: string | null): string {
  const p = new URLSearchParams();
  if (workspaceId) p.set('startupWorkspace', workspaceId);
  const q = p.toString();
  return q ? `/dashboard/new-scan?${q}` : '/dashboard/new-scan';
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

  const showDestinationsHint = canSend && slackActiveDestinations.length === 0;

  return (
    <>
      <article
        data-testid="startup-delivery-tab"
        className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2"
      >
        <h2 className="text-lg font-semibold">Slack delivery</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Manual send to Slack, audit delivery counts, and workspace auto-post status.
        </p>
        {slackStatusMessage ? (
          <p className="mt-3 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface">
            {slackStatusMessage}
          </p>
        ) : null}

        <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant">Audit delivery context</p>
          <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-md bg-surface-container-low px-3 py-2">Deep audits: {dashboard.reports.length}</div>
            <div className="rounded-md bg-surface-container-low px-3 py-2">Delivered: {deliveredReports}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Auto-post</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">
              {startupRolloutFlags?.slackAutoPost ? 'On' : 'Off'}
            </p>
          </div>
          <Link
            href={settingsTabHref(workspaceId)}
            className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
          >
            Configure in Settings
          </Link>
        </div>

        {showDestinationsHint ? (
          <p className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            No active Slack destinations yet.{' '}
            <Link href={settingsTabHref(workspaceId)} className="font-semibold text-primary underline">
              Add destinations in Settings
            </Link>
          </p>
        ) : null}

        <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant">Push to Slack</p>
          {dashboard.reports.length === 0 ? (
            <p
              data-testid="startup-delivery-empty-reports"
              className="mt-3 rounded-lg border border-dashed border-outline-variant bg-surface-container px-3 py-3 text-sm text-on-surface-variant"
            >
              No deep audit reports in this workspace yet. After a paid deep audit completes, select a report here.{' '}
              <Link href={auditsTabHref(workspaceId)} className="font-semibold text-primary underline">
                Audits
              </Link>{' '}
              lists history, or{' '}
              <Link href={newScanHref(workspaceId)} className="font-semibold text-primary underline">
                start a new scan
              </Link>
              .
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
                {slackActiveDestinations.length === 0 ? (
                  <option value="">No active Slack destinations</option>
                ) : (
                  slackActiveDestinations.map((destination) => (
                    <option key={destination.id} value={destination.id}>
                      {destination.channelName ?? destination.channelId}
                    </option>
                  ))
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
                disabled={dashboard.reports.length === 0 || slackActiveDestinations.length === 0}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Push to Slack
              </button>
            </form>
          ) : (
            <p className="mt-2 text-xs text-on-surface-variant">
              {!startupRolloutFlags?.slackAgent
                ? 'Slack delivery is disabled by rollout flags for this workspace.'
                : !startupServiceGates?.slackIntegration.enabled || !startupServiceGates?.slackNotifications.enabled
                ? 'Slack manual send requires Slack integration and notifications to be entitled and enabled for this workspace.'
                : 'Select a workspace to send Slack delivery.'}
            </p>
          )}
        </div>
      </article>

      <article className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2">
        <h2 className="text-lg font-semibold">Recent delivery attempts</h2>
        <p className="mt-1 text-sm text-on-surface-variant">Latest Slack delivery events for this workspace.</p>
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
      </article>
    </>
  );
}
