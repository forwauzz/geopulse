import { ServiceControlAdminView } from '@/components/service-control-admin-view';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createServiceControlAdminData } from '@/lib/server/service-control-admin-data';

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

export default async function ServiceControlAdminPage() {
  const adminContext = await loadAdminPageContext('/dashboard/services');
  if (!adminContext.ok) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <p className="text-error">{adminContext.message}</p>
      </main>
    );
  }

  try {
    const data = createServiceControlAdminData(adminContext.adminDb);
    const overview = await data.getOverview();
    return <ServiceControlAdminView overview={overview} />;
  } catch (error) {
    const message = readErrorMessage(error);
    const missingTable =
      /service_catalog|service_bundles|service_bundle_services|service_entitlement_overrides|relation .* does not exist|column .* does not exist|schema cache/i.test(
        message
      );

    return (
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">
          Service control center
        </h1>
        <p className="mt-4 text-error">
          Could not load service controls.
          <br />
          {message}
        </p>
        {missingTable ? (
          <div className="mt-6 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            Your database is missing the service-entitlement foundation migration. Run{' '}
            <code>npm run db:migrate</code> or apply{' '}
            <code>supabase/migrations/021_service_entitlements_foundation.sql</code>.
          </div>
        ) : null}
      </main>
    );
  }
}

