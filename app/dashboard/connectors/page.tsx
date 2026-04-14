import { redirect } from 'next/navigation';
import Link from 'next/link';
import { loadStartupConnectorsContext } from '@/app/dashboard/connectors/lib/load-startup-connectors-context';
import { ConnectorsNav, type ConnectorTabId } from '@/app/dashboard/connectors/components/connectors-nav';
import { GithubConnectorPanel } from '@/app/dashboard/connectors/components/github-connector-panel';
import { SlackConnectorPanel } from '@/app/dashboard/connectors/components/slack-connector-panel';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { StartupWorkspaceEnsureTrigger } from '@/components/startup-workspace-ensure-trigger';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    startupWorkspace?: string;
    github?: string;
    slack?: string;
    slack_detail?: string;
    status?: string;
    connector?: string;
  }>;
};

// ── Status banner (OAuth return messages) ───────────────────────
function statusMessage(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key === 'success') return 'Connection successful.';
  if (key === 'error') return 'Connection failed. Please try again.';
  if (key === 'cancelled') return 'Connection cancelled.';
  if (key === 'already_connected') return 'This integration is already connected.';
  if (key === 'cadence_updated') return 'Recurring audit schedule saved.';
  if (key === 'invalid_schedule_date') return 'Enter a valid schedule start date.';
  if (key === 'invalid_schedule_time') return 'Enter a valid schedule time.';
  if (key === 'invalid_schedule_timezone') return 'Enter a valid time zone.';
  if (key === 'slack_markdown_ok') return 'Markdown report uploaded to Slack.';
  if (key === 'slack_markdown_failed') return 'Markdown upload to Slack failed.';
  return null;
}

function resolveConnectorTab(
  sp: { connector?: string; slack_detail?: string; slack?: string; github?: string; status?: string },
  opts: { githubEnabled: boolean; slackEnabled: boolean },
): ConnectorTabId {
  if (sp.connector === 'slack') return 'slack';
  if (sp.connector === 'github') return 'github';
  if (sp.slack) return 'slack';
  if (sp.github) return 'github';
  if (sp.slack_detail) return 'slack';
  const st = sp.status;
  if (
    st === 'cadence_updated' ||
    st === 'invalid_schedule_date' ||
    st === 'invalid_schedule_time' ||
    st === 'invalid_schedule_timezone' ||
    st === 'slack_markdown_ok' ||
    st === 'slack_markdown_failed' ||
    st === 'env_missing'
  ) {
    return 'slack';
  }
  if (opts.githubEnabled) return 'github';
  if (opts.slackEnabled) return 'slack';
  return 'github';
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
  const statusMsg = statusMessage(sp.status);

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
            Setting up your workspace
          </p>
          <p className="mt-2 text-sm text-on-surface-variant">
            Your subscription is active. Finalizing workspace setup now.
          </p>
          <div className="mt-4">
            <StartupWorkspaceEnsureTrigger />
          </div>
        </div>
      </section>
    );
  }

  if (loaded.kind === 'workspace-missing-membership') {
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
            person_off
          </span>
          <p className="mt-4 font-headline text-lg font-semibold text-on-background">
            Workspace access needs repair
          </p>
          <p className="mt-2 text-sm text-on-surface-variant">
            Your subscription is active, but your account is not linked as an active member of
            {loaded.workspaceName ? ` ${loaded.workspaceName}` : ' this workspace'} yet. Ask an admin
            to restore membership, or refresh after the workspace link is repaired.
          </p>
          <Link
            href="/dashboard"
            className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
          >
            Go to dashboard
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
            Setting up your workspace
          </p>
          <p className="mt-2 text-sm text-on-surface-variant">
            Your subscription was received. Finalizing your workspace setup now.
          </p>
          <div className="mt-4">
            <StartupWorkspaceEnsureTrigger />
          </div>
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
  const auditScheduleDate =
    typeof workspaceMetadata.audit_schedule_date === 'string' ? workspaceMetadata.audit_schedule_date : '';
  const auditScheduleTime =
    typeof workspaceMetadata.audit_schedule_time === 'string' ? workspaceMetadata.audit_schedule_time : '09:00';
  const auditScheduleTimezone =
    typeof workspaceMetadata.audit_schedule_timezone === 'string'
      ? workspaceMetadata.audit_schedule_timezone
      : 'UTC';

  const githubEnabled = !!startupRolloutFlags?.githubAgent && !!startupServiceGates?.githubIntegration.enabled;
  const slackEnabled = !!startupRolloutFlags?.slackAgent && !!startupServiceGates?.slackIntegration.enabled;
  const githubConnected = githubState.installation?.status === 'connected';
  const slackConnected = slackActiveInstallations.length > 0;
  const slackAutoPostEnabled = !!startupRolloutFlags?.slackAutoPost;

  const activeConnector = resolveConnectorTab(sp, { githubEnabled, slackEnabled });

  const workspaceNavQuery = new URLSearchParams();
  if (workspaceId) workspaceNavQuery.set('startupWorkspace', workspaceId);

  const returnToParams = new URLSearchParams(workspaceNavQuery);
  returnToParams.set('connector', activeConnector);
  const returnToConnectors = `/dashboard/connectors?${returnToParams.toString()}`;

  // Deep audit reports for push form
  const deepAuditReports = dashboard.reports
    .filter((r) => r.type === 'deep_audit')
    .slice(0, 10);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Dashboard</p>
        <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Connectors</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Integrate GitHub and Slack to automate PR creation and deliver audit notifications.
          {selectedWorkspace ? (
            <span className="ml-2 font-medium text-on-background">Workspace: {selectedWorkspace.name}</span>
          ) : null}
        </p>
      </div>

      {githubMsg ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            sp.github === 'success' ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'
          }`}
        >
          <span className="material-symbols-outlined mr-1.5 align-middle text-[16px]" aria-hidden>
            {sp.github === 'success' ? 'check_circle' : 'error'}
          </span>
          GitHub — {githubMsg}
        </div>
      ) : null}

      {statusMsg ? (
        <div className="rounded-xl border border-outline-variant/10 bg-primary/5 px-4 py-3 text-sm text-on-surface">
          {statusMsg}
        </div>
      ) : null}

      {slackMsg ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            sp.slack === 'success' ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'
          }`}
        >
          <span className="material-symbols-outlined mr-1.5 align-middle text-[16px]" aria-hidden>
            {sp.slack === 'success' ? 'check_circle' : 'error'}
          </span>
          Slack — {slackMsg}
        </div>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <ConnectorsNav
          workspaceQuery={workspaceNavQuery.toString()}
          active={activeConnector}
          items={[
            { id: 'github', label: 'GitHub', icon: 'code', enabled: githubEnabled },
            { id: 'slack', label: 'Slack', icon: 'chat', enabled: slackEnabled },
          ]}
        />

        {activeConnector === 'github' ? (
          <GithubConnectorPanel
            workspaceId={workspaceId}
            githubEnabled={githubEnabled}
            bundleKey={startupServiceGates?.githubIntegration.bundleKey ?? null}
            githubState={githubState}
            githubAllowlistValue={githubAllowlistValue}
            githubConnected={githubConnected}
          />
        ) : (
          <SlackConnectorPanel
            workspaceId={workspaceId}
            returnToConnectors={returnToConnectors}
            slackEnabled={slackEnabled}
            bundleKey={startupServiceGates?.slackIntegration.bundleKey ?? null}
            slackActiveInstallations={slackActiveInstallations}
            slackActiveDestinations={slackActiveDestinations}
            slackConnected={slackConnected}
            canManageSlackAutoPost={canManageSlackAutoPost}
            slackAutoPostEnabled={slackAutoPostEnabled}
            auditCadenceDays={auditCadenceDays}
            auditScheduleDate={auditScheduleDate}
            auditScheduleTime={auditScheduleTime}
            auditScheduleTimezone={auditScheduleTimezone}
            deepAuditReports={deepAuditReports}
            slackDeliveryEvents={slackDeliveryEvents}
          />
        )}
      </div>
    </section>
  );
}
