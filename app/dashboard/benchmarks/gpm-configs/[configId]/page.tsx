import Link from 'next/link';
import { GpmRunTriggerSection } from '@/components/gpm-run-trigger-section';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createGpmAdminData } from '@/lib/server/geo-performance-admin-data';

export const dynamic = 'force-dynamic';

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

export default async function GpmConfigDetailPage({
  params,
}: {
  params: Promise<{ configId: string }>;
}) {
  const { configId } = await params;
  const adminContext = await loadAdminPageContext('/dashboard/benchmarks/gpm-configs');
  if (!adminContext.ok) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-error">{adminContext.message}</p>
      </main>
    );
  }

  const gpmData = createGpmAdminData(adminContext.adminDb);

  const [config, reports] = await Promise.all([
    gpmData.getConfig(configId),
    gpmData.getReportsForConfig(configId).catch(() => []),
  ]);

  if (!config) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <Link
          href="/dashboard/benchmarks/gpm-configs"
          className="text-sm text-primary hover:underline"
        >
          ← Back to configs
        </Link>
        <p className="mt-6 text-error">Config not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link
        href="/dashboard/benchmarks/gpm-configs"
        className="text-sm text-primary hover:underline"
      >
        ← Back to configs
      </Link>

      <div className="mt-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-bold text-on-background">
            {config.domain_display ?? config.domain_canonical}
          </h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">{config.domain_canonical}</p>
        </div>
        <span className="rounded-full border border-outline-variant/30 px-3 py-1 text-xs text-on-surface-variant">
          {config.cadence}
        </span>
      </div>

      {/* Config summary */}
      <div className="mt-6 grid gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-low p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="text-xs font-medium text-on-surface-variant">Topic</p>
          <p className="mt-0.5 text-sm text-on-surface">{config.topic}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-on-surface-variant">Location</p>
          <p className="mt-0.5 text-sm text-on-surface">{config.location}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-on-surface-variant">Platforms</p>
          <p className="mt-0.5 text-sm text-on-surface">
            {config.platforms_enabled.map((p) => PLATFORM_LABELS[p] ?? p).join(', ') || '—'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-on-surface-variant">Query set</p>
          <p className="mt-0.5 text-sm text-on-surface">{config.query_set_id ?? '— not assigned'}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-on-surface-variant">Report email</p>
          <p className="mt-0.5 text-sm text-on-surface">{config.report_email ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-on-surface-variant">Competitors</p>
          <p className="mt-0.5 text-sm text-on-surface">{config.competitor_list.length} entries</p>
        </div>
        {config.startup_workspace_id && (
          <div>
            <p className="text-xs font-medium text-on-surface-variant">Workspace</p>
            <p className="mt-0.5 font-mono text-xs text-on-surface-variant">
              {config.startup_workspace_id}
            </p>
          </div>
        )}
        {config.agency_account_id && (
          <div>
            <p className="text-xs font-medium text-on-surface-variant">Agency account</p>
            <p className="mt-0.5 font-mono text-xs text-on-surface-variant">
              {config.agency_account_id}
            </p>
          </div>
        )}
      </div>

      {/* Run trigger + report preview */}
      <div className="mt-8">
        <h2 className="font-headline text-lg font-semibold text-on-background">
          Reports &amp; run trigger
        </h2>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          View generated PDFs and trigger a dry run to validate config wiring before the first
          scheduled delivery.
        </p>
        <div className="mt-4">
          <GpmRunTriggerSection configId={config.id} reports={reports} />
        </div>
      </div>
    </main>
  );
}
