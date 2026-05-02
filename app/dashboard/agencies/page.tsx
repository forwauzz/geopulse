import { AgencyAdminControlView } from '@/components/agency-admin-control-view';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createAgencyAdminData } from '@/lib/server/agency-admin-data';
import { createGpmAdminData, type GpmConfigAdminRow } from '@/lib/server/geo-performance-admin-data';

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
    const gpmData = createGpmAdminData(adminContext.adminDb);

    const [accounts, gpmConfigs, querySetOptions, domainOptions] = await Promise.all([
      agencyData.getAccounts(),
      gpmData.listAllConfigs().catch(() => [] as GpmConfigAdminRow[]),
      gpmData.getQuerySetOptions().catch(() => []),
      gpmData.getDomainOptions().catch(() => []),
    ]);

    const gpmConfigsByAccountId = new Map<string, GpmConfigAdminRow[]>();
    for (const config of gpmConfigs) {
      if (!config.agency_account_id) continue;
      const existing = gpmConfigsByAccountId.get(config.agency_account_id) ?? [];
      existing.push(config);
      gpmConfigsByAccountId.set(config.agency_account_id, existing);
    }

    return (
      <AgencyAdminControlView
        accounts={accounts}
        gpmConfigsByAccountId={gpmConfigsByAccountId}
        gpmQuerySetOptions={querySetOptions}
        gpmDomainOptions={domainOptions}
      />
    );
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
