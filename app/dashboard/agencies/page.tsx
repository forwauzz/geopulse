import { AgencyAdminControlView } from '@/components/agency-admin-control-view';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createAgencyAdminData } from '@/lib/server/agency-admin-data';

export const dynamic = 'force-dynamic';

export default async function AgenciesAdminPage() {
  const adminContext = await loadAdminPageContext('/dashboard/agencies');
  if (!adminContext.ok) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-error">{adminContext.message}</p>
      </main>
    );
  }

  try {
    const agencyData = createAgencyAdminData(adminContext.adminDb);
    const accounts = await agencyData.getAccounts();
    return <AgencyAdminControlView accounts={accounts} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load agency pilot controls.';
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">Agency pilot control</h1>
        <p className="mt-4 text-error">{message}</p>
        <div className="mt-6 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          Apply the agency pilot foundation migration before using this page:
          <code className="ml-2">supabase/migrations/019_agency_pilot_foundation.sql</code>
        </div>
      </main>
    );
  }
}
