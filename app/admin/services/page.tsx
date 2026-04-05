import { ServiceControlAdminView } from '@/components/service-control-admin-view';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createServiceControlAdminData } from '@/lib/server/service-control-admin-data';

export const dynamic = 'force-dynamic';

export default async function AdminServicesPage() {
  const adminContext = await loadAdminPageContext('/admin');
  if (!adminContext.ok) {
    return <p className="text-sm text-error">{adminContext.message}</p>;
  }

  try {
    const data = createServiceControlAdminData(adminContext.adminDb);
    const overview = await data.getOverview();
    return <ServiceControlAdminView overview={overview} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load service controls.';
    const missingTable =
      /service_catalog|service_bundles|service_bundle_services|service_entitlement_overrides|relation .* does not exist|column .* does not exist|schema cache/i.test(
        message
      );
    return (
      <div className="space-y-4">
        <h1 className="font-headline text-3xl font-bold text-on-background">Service control center</h1>
        <p className="text-sm text-error">{message}</p>
        {missingTable ? (
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            Apply the service entitlements foundation migration:{' '}
            <code>supabase/migrations/021_service_entitlements_foundation.sql</code>
          </div>
        ) : null}
      </div>
    );
  }
}
