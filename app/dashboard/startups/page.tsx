import { StartupAdminControlView } from '@/components/startup-admin-control-view';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createStartupAdminData } from '@/lib/server/startup-admin-data';

export const dynamic = 'force-dynamic';

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== 'object') return 'Unknown error';

  const message =
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : null;
  const details =
    typeof (error as { details?: unknown }).details === 'string'
      ? (error as { details: string }).details
      : null;
  const hint =
    typeof (error as { hint?: unknown }).hint === 'string' ? (error as { hint: string }).hint : null;

  const parts = [message, details, hint].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0
  );
  if (parts.length === 0) return 'Unknown error';
  return parts.join(' | ');
}

export default async function StartupsAdminPage() {
  const adminContext = await loadAdminPageContext('/dashboard/startups');
  if (!adminContext.ok) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-error">{adminContext.message}</p>
      </main>
    );
  }

  try {
    const startupData = createStartupAdminData(adminContext.adminDb);
    const workspaces = await startupData.getWorkspaces();
    return <StartupAdminControlView workspaces={workspaces} />;
  } catch (error) {
    const message = readErrorMessage(error);
    const missingTable =
      /startup_workspaces|startup_workspace_users|relation .* does not exist|column .* does not exist|schema cache/i.test(
        message
      );

    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">Startup control</h1>
        <p className="mt-4 text-error">
          Could not load startup workspace controls.
          <br />
          {message}
        </p>
        {missingTable ? (
          <div className="mt-6 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            Apply startup workspace migration before using this page:
            <code className="ml-2">supabase/migrations/022_startup_workspace_foundation.sql</code>
          </div>
        ) : null}
      </main>
    );
  }
}
