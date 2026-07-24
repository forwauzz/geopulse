import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { AuditDashboardOverview } from '@/components/audit-dashboard-overview';
import { DashboardScanHero } from '@/components/dashboard-scan-hero';
import { buildAuditDashboardView, type AuditScanRow } from '@/lib/server/audit-dashboard-data';
import {
  loadEngineCitationMetrics,
  type EngineCitationMetric,
  type EngineKey,
} from '@/lib/server/dashboard-citation-metrics';
import { getCitationEvidence, type EngineEvidence } from '@/lib/server/citation-evidence';
import { getMarketPosition, type MarketPosition } from '@/lib/server/market-position';
import { getTrackedPromptPanel, type TrackedPromptPanel } from '@/lib/server/tracked-prompts';
import { CitationEvidencePanel } from '@/components/citation-evidence-panel';
import { TrackedPromptsPanel } from '@/components/tracked-prompts-panel';
import { getTurnstileSiteKey } from '@/lib/turnstile-site-key';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';
import { AgencyHome } from '@/components/agency-home';

export const dynamic = 'force-dynamic';

/**
 * Logged-in home: the scan box on top, then an overview of what the user's own audits measured.
 * Anything we do not measure for self-serve users is labelled "coming soon", never simulated.
 */
export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams?: Promise<{ url?: string; prompt?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard');

  const agencyWorkspace = await loadCurrentAgencyWorkspace({ userId: user.id, supabase });
  if (agencyWorkspace) {
    return <AgencyHome data={agencyWorkspace.data} />;
  }

  // Attribute scans to the user's first startup workspace, if any.
  let startupWorkspaceId: string | null = null;
  let admin: ReturnType<typeof createServiceRoleClient> | null = null;
  const env = await getScanApiEnv();
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      const { data } = await admin
        .from('startup_workspace_users')
        .select('startup_workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      startupWorkspaceId = (data?.startup_workspace_id as string | undefined) ?? null;
    } catch {
      startupWorkspaceId = null;
    }
  }

  // The user's own audits, newest first — personal and workspace-attributed alike. Fail-soft:
  // a broken overview query must never take down the scan box.
  let scanRows: AuditScanRow[] = [];
  try {
    const { data } = await supabase
      .from('scans')
      .select('id, url, domain, score, letter_grade, created_at, issues_json, full_results_json')
      .eq('user_id', user.id)
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(10);
    scanRows = (data ?? []) as AuditScanRow[];
  } catch {
    scanRows = [];
  }

  const view = buildAuditDashboardView(scanRows);

  // Real citation data where the audited domain is in the benchmark system; {} otherwise.
  let engineCitations: Partial<Record<EngineKey, EngineCitationMetric>> = {};
  let promptPanel: TrackedPromptPanel | null = null;
  let citationEvidence: EngineEvidence[] = [];
  let marketPosition: MarketPosition | null = null;
  if (admin && view.latest?.domain) {
    [engineCitations, promptPanel, citationEvidence, marketPosition] = await Promise.all([
      loadEngineCitationMetrics({ supabase: admin, domain: view.latest.domain }),
      getTrackedPromptPanel({ supabase: admin, domain: view.latest.domain }),
      getCitationEvidence({ supabase: admin, domain: view.latest.domain }),
      // Same anonymized cohort computation as the PDF's market-position section (issue #133).
      getMarketPosition(admin, view.latest.domain, view.latest.score),
    ]);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <DashboardScanHero
          siteKey={getTurnstileSiteKey()}
          defaultUrl={sp.url}
          agencyAccountId={null}
          agencyClientId={null}
          startupWorkspaceId={startupWorkspaceId}
          scanDisabled={false}
          startupAccessBlocked={false}
          contextLine={null}
          authenticated
        />
      </div>
      <AuditDashboardOverview view={view} engineCitations={engineCitations} marketPosition={marketPosition} />
      {promptPanel?.tracked && view.latest?.domain ? (
        <div className="mx-auto w-full max-w-6xl">
          <TrackedPromptsPanel panel={promptPanel} domain={view.latest.domain} statusCode={sp.prompt} />
        </div>
      ) : null}
      {citationEvidence.length > 0 && view.latest?.domain ? (
        <div className="mx-auto w-full max-w-6xl">
          <CitationEvidencePanel evidence={citationEvidence} domain={view.latest.domain} />
        </div>
      ) : null}
    </div>
  );
}
