import { AgencyAdminControlView } from '@/components/agency-admin-control-view';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createAgencyAdminData } from '@/lib/server/agency-admin-data';

export const dynamic = 'force-dynamic';

export default async function AdminAgenciesPage() {
  const adminContext = await loadAdminPageContext('/admin');
  if (!adminContext.ok) {
    return <p className="text-sm text-error">{adminContext.message}</p>;
  }

  try {
    const agencyData = createAgencyAdminData(adminContext.adminDb);
    const accounts = await agencyData.getAccounts();
    return <AgencyAdminControlView accounts={accounts} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load agency pilot controls.';
    return (
      <div className="space-y-4">
        <h1 className="font-headline text-3xl font-bold text-on-background">Agency pilot control</h1>
        <p className="text-sm text-error">{message}</p>
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          Apply the agency pilot foundation migration before using this page:{' '}
          <code>supabase/migrations/019_agency_pilot_foundation.sql</code>
        </div>
      </div>
    );
  }
}
