import { StartupAdminControlView } from '@/components/startup-admin-control-view';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createStartupAdminData } from '@/lib/server/startup-admin-data';

export const dynamic = 'force-dynamic';

export default async function AdminStartupsPage() {
  const adminContext = await loadAdminPageContext('/admin');
  if (!adminContext.ok) {
    return <p className="text-sm text-error">{adminContext.message}</p>;
  }

  try {
    const startupData = createStartupAdminData(adminContext.adminDb);
    const workspaces = await startupData.getWorkspaces();
    return <StartupAdminControlView workspaces={workspaces} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load startup workspace controls.';
    const missingTable =
      /startup_workspaces|startup_workspace_users|relation .* does not exist|column .* does not exist|schema cache/i.test(
        message
      );
    return (
      <div className="space-y-4">
        <h1 className="font-headline text-3xl font-bold text-on-background">Startup control</h1>
        <p className="text-sm text-error">{message}</p>
        {missingTable ? (
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            Apply startup workspace migration before using this page:{' '}
            <code>supabase/migrations/022_startup_workspace_foundation.sql</code>
          </div>
        ) : null}
      </div>
    );
  }
}
