'use client';

import { useActionState } from 'react';
import {
  createStartupWorkspace,
  createStartupWorkspaceUser,
  deleteStartupWorkspace,
  removeStartupWorkspaceMember,
  type StartupAdminActionState,
  updateStartupWorkspaceRolloutFlags,
} from '@/app/dashboard/startups/actions';
import type { StartupWorkspaceAdminDetail } from '@/lib/server/startup-admin-data';
import type { GpmConfigAdminRow, GpmQuerySetOption } from '@/lib/server/geo-performance-admin-data';
import { GpmWorkspaceConfigSection } from '@/components/gpm-workspace-config-section';

const initialState: StartupAdminActionState | null = null;

type Props = {
  readonly workspaces: StartupWorkspaceAdminDetail[];
  readonly gpmConfigsByWorkspaceId?: ReadonlyMap<string, GpmConfigAdminRow[]>;
  readonly gpmQuerySetOptions?: GpmQuerySetOption[];
};

function formatLabel(value: string | null): string {
  if (!value) return '-';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function StartupAdminControlView({ workspaces, gpmConfigsByWorkspaceId, gpmQuerySetOptions }: Props) {
  const [workspaceState, workspaceAction, workspacePending] = useActionState(
    createStartupWorkspace,
    initialState
  );
  const [userState, userAction, userPending] = useActionState(
    createStartupWorkspaceUser,
    initialState
  );
  const [rolloutState, rolloutAction, rolloutPending] = useActionState(
    updateStartupWorkspaceRolloutFlags,
    initialState
  );
  const [removeMemberState, removeMemberAction, removeMemberPending] = useActionState(
    removeStartupWorkspaceMember,
    initialState
  );
  const [deleteWorkspaceState, deleteWorkspaceAction, deleteWorkspacePending] = useActionState(
    deleteStartupWorkspace,
    initialState
  );

  return (
    <main className="mx-auto max-w-7xl px-6 py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">
            Admin
          </p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
            Startup workspace control
          </h1>
          <p className="mt-1 max-w-3xl font-body text-on-surface-variant">
            Bootstrap startup founder/team workspaces for the startup dashboard path.
          </p>
        </div>
      </div>

      <section className="mt-10 grid gap-4 lg:grid-cols-2">
        <form
          action={workspaceAction}
          className="rounded-xl bg-surface-container-lowest p-5 shadow-float"
        >
          <h2 className="font-headline text-lg font-semibold text-on-background">
            Create startup workspace
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Workspace key</span>
              <input
                name="workspaceKey"
                required
                placeholder="acme"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Name</span>
              <input
                name="name"
                required
                placeholder="Acme"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Primary domain</span>
              <input
                name="primaryDomain"
                placeholder="acme.com"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Canonical domain</span>
              <input
                name="canonicalDomain"
                placeholder="acme.com"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Status</span>
              <select
                name="status"
                defaultValue="pilot"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="pilot">pilot</option>
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Billing mode</span>
              <select
                name="billingMode"
                defaultValue="free"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="free">free</option>
                <option value="trial">trial</option>
                <option value="paid">paid</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={workspacePending}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
            >
              {workspacePending ? 'Saving...' : 'Create workspace'}
            </button>
            {workspaceState ? (
              <p className={`text-sm ${workspaceState.ok ? 'text-primary' : 'text-error'}`}>
                {workspaceState.message}
              </p>
            ) : null}
          </div>
        </form>

        <form action={userAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">Add startup member</h2>
          <div className="mt-4 grid gap-4">
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Workspace</span>
              <select
                name="startupWorkspaceId"
                required
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="">Choose a workspace</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({workspace.workspace_key})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Email</span>
              <input
                name="email"
                type="email"
                required
                placeholder="founder@acme.com"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Password</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Role</span>
              <select
                name="role"
                defaultValue="member"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="founder">founder</option>
                <option value="admin">admin</option>
                <option value="member">member</option>
                <option value="viewer">viewer</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={userPending}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
            >
              {userPending ? 'Saving...' : 'Save member'}
            </button>
            {userState ? (
              <p className={`text-sm ${userState.ok ? 'text-primary' : 'text-error'}`}>
                {userState.message}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section className="mt-12 space-y-6">
        {workspaces.length === 0 ? (
          <div className="rounded-xl bg-surface-container-low p-6 text-sm text-on-surface-variant">
            No startup workspaces yet. Create the first one from the form above.
          </div>
        ) : (
          workspaces.map((workspace) => (
            <article key={workspace.id} className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-headline text-2xl font-bold text-on-background">{workspace.name}</h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {workspace.workspace_key}
                    {workspace.canonical_domain ? ` · ${workspace.canonical_domain}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-lg bg-primary/15 px-3 py-1 text-primary">
                    {formatLabel(workspace.status)}
                  </span>
                  <span className="rounded-lg bg-surface-container-high px-3 py-1 text-on-surface-variant">
                    {formatLabel(workspace.billing_mode)}
                  </span>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-4">
                <div className="rounded-xl bg-surface-container-low p-4">
                  <p className="text-xs uppercase tracking-widest text-on-surface-variant">Members</p>
                  <p className="mt-1 text-2xl font-bold text-on-background">{workspace.users.length}</p>
                </div>
              </div>

              <form action={rolloutAction} className="mt-4 rounded-xl bg-surface-container-low p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-on-background">Rollout flags</p>
                  <input type="hidden" name="startupWorkspaceId" value={workspace.id} />
                  <button
                    type="submit"
                    disabled={rolloutPending}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary disabled:opacity-60"
                  >
                    {rolloutPending ? 'Saving...' : 'Save rollout flags'}
                  </button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-5 text-sm text-on-background">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="startupDashboard"
                      defaultChecked={workspace.rolloutFlags.startupDashboard}
                    />
                    Startup dashboard
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="githubAgent"
                      defaultChecked={workspace.rolloutFlags.githubAgent}
                    />
                    GitHub agent
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="autoPr" defaultChecked={workspace.rolloutFlags.autoPr} />
                    Auto PR
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="slackAgent"
                      defaultChecked={workspace.rolloutFlags.slackAgent}
                    />
                    Slack agent
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="slackAutoPost"
                      defaultChecked={workspace.rolloutFlags.slackAutoPost}
                    />
                    Slack auto-post
                  </label>
                </div>
                {rolloutState ? (
                  <p className={`mt-2 text-xs ${rolloutState.ok ? 'text-primary' : 'text-error'}`}>
                    {rolloutState.message}
                  </p>
                ) : null}
              </form>

              <div className="mt-6 rounded-xl bg-surface-container-low p-4">
                <p className="text-sm font-medium text-on-background">Workspace members</p>
                <ul className="mt-2 space-y-2 text-sm text-on-surface-variant">
                  {workspace.users.length === 0 ? (
                    <li>No members assigned yet.</li>
                  ) : (
                    workspace.users.map((user) => (
                      <li key={user.id} className="flex items-center justify-between gap-3">
                        <span>
                          {user.email ?? user.user_id} · {formatLabel(user.role)} · {formatLabel(user.status)}
                        </span>
                        <form action={removeMemberAction} className="shrink-0">
                          <input type="hidden" name="startupWorkspaceId" value={workspace.id} />
                          <input type="hidden" name="userId" value={user.user_id} />
                          <button
                            type="submit"
                            disabled={removeMemberPending}
                            className="text-xs text-error hover:underline disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </form>
                      </li>
                    ))
                  )}
                  {removeMemberState?.ok === false && (
                    <li className="text-xs text-error">{removeMemberState.message}</li>
                  )}
                </ul>
              </div>

              <div className="mt-4 rounded-xl bg-surface-container-low p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-on-background">Startup timeline (recent)</p>
                  <span className="text-xs text-on-surface-variant">{workspace.timeline.length} events</span>
                </div>
                <ul className="mt-2 space-y-2 text-sm text-on-surface-variant">
                  {workspace.timeline.length === 0 ? (
                    <li>No startup events logged yet.</li>
                  ) : (
                    workspace.timeline.map((event) => (
                      <li key={event.id} className="rounded-lg bg-surface-container-high px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-on-background">{event.event}</span>
                          <span className="text-xs text-on-surface-variant">{formatTimestamp(event.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-xs">
                          {event.summary || 'No summary fields'} {event.actorUserId ? `· actor: ${event.actorUserId}` : ''}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <GpmWorkspaceConfigSection
                configs={gpmConfigsByWorkspaceId?.get(workspace.id) ?? []}
                querySetOptions={gpmQuerySetOptions ?? []}
              />

              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-error hover:underline">
                  Delete workspace
                </summary>
                <form action={deleteWorkspaceAction} className="mt-3 flex flex-col gap-3 rounded-xl border border-error/20 bg-surface-container-low p-4">
                  <input type="hidden" name="startupWorkspaceId" value={workspace.id} />
                  <label className="flex flex-col gap-1 text-sm text-on-background">
                    <span className="font-medium">
                      Type <span className="font-mono text-error">{workspace.name}</span> to confirm
                    </span>
                    <input
                      type="text"
                      name="confirmName"
                      autoComplete="off"
                      placeholder={workspace.name}
                      className="rounded-lg border border-outline-variant/20 bg-surface-container px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={deleteWorkspacePending}
                      className="rounded-lg bg-error px-4 py-2 text-sm font-medium text-on-error disabled:opacity-50"
                    >
                      {deleteWorkspacePending ? 'Deleting…' : 'Delete workspace'}
                    </button>
                    {deleteWorkspaceState?.ok === false && (
                      <p className="text-xs text-error">{deleteWorkspaceState.message}</p>
                    )}
                    {deleteWorkspaceState?.ok === true && (
                      <p className="text-xs text-primary">{deleteWorkspaceState.message}</p>
                    )}
                  </div>
                </form>
              </details>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
