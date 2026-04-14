import Link from 'next/link';
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

    return (
      <div className="space-y-8">
        {/* ── Quick bundle editor links ───────────────────────────────────────── */}
        <section className="space-y-3">
          <div>
            <h2 className="font-headline text-lg font-semibold text-on-background">Bundle editor</h2>
            <p className="mt-0.5 text-sm text-on-surface-variant">
              Pick a bundle to edit its billing config and included services in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {overview.bundles.map((bundle) => (
              <Link
                key={bundle.id}
                href={`/admin/bundles/${bundle.bundle_key}`}
                className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/10"
              >
                <span className="material-symbols-outlined text-base">tune</span>
                {bundle.name}
              </Link>
            ))}
          </div>
        </section>

        {/* ── Existing service control view ──────────────────────────────────── */}
        <ServiceControlAdminView overview={overview} />
      </div>
    );
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
