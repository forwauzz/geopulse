import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createGpmAdminData } from '@/lib/server/geo-performance-admin-data';
import { GpmConfigsAdminView } from '@/components/gpm-configs-admin-view';

export const dynamic = 'force-dynamic';

export default async function GpmConfigsAdminPage() {
  const adminContext = await loadAdminPageContext('/dashboard/benchmarks/gpm-configs');
  if (!adminContext.ok) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">{adminContext.message}</p>
      </main>
    );
  }

  try {
    const gpmData = createGpmAdminData(adminContext.adminDb);
    const [configs, domainOptions, querySetOptions, workspaceOptions, agencyOptions] =
      await Promise.all([
        gpmData.listAllConfigs(),
        gpmData.getDomainOptions(),
        gpmData.getQuerySetOptions(),
        gpmData.getStartupWorkspaceOptions().catch(() => []),
        gpmData.getAgencyAccountOptions().catch(() => []),
      ]);

    return (
      <GpmConfigsAdminView
        configs={configs}
        domainOptions={domainOptions}
        querySetOptions={querySetOptions}
        workspaceOptions={workspaceOptions}
        agencyOptions={agencyOptions}
      />
    );
  } catch (error) {
    let message = 'Could not load GPM configs.';
    if (error instanceof Error) {
      message = error.message;
    } else if (error && typeof error === 'object') {
      const e = error as Record<string, unknown>;
      const parts = [e['message'], e['details'], e['hint']]
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
      if (parts.length > 0) message = parts.join(' | ');
    }
    const missingTable =
      /client_benchmark_configs|benchmark_domains|query_sets|relation .* does not exist|column .* does not exist|schema cache/i.test(message);

    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">GPM Configs</h1>
        <p className="mt-4 text-error">{message}</p>
        {missingTable ? (
          <div className="mt-6 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            Apply the GPM config migration before using this page:
            <code className="ml-2">supabase/migrations/043_client_benchmark_configs.sql</code>
          </div>
        ) : null}
      </main>
    );
  }
}
