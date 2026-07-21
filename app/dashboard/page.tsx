import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { AuditDashboardOverview } from '@/components/audit-dashboard-overview';
import { DashboardScanHero } from '@/components/dashboard-scan-hero';
import { buildAuditDashboardView, type AuditScanRow } from '@/lib/server/audit-dashboard-data';
import { getTurnstileSiteKey } from '@/lib/turnstile-site-key';

export const dynamic = 'force-dynamic';

/**
 * Logged-in home: the scan box on top, then an overview of what the user's own audits measured.
 * Anything we do not measure for self-serve users is labelled "coming soon", never simulated.
 */
export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams?: Promise<{ url?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard');

  // Attribute scans to the user's first startup workspace, if any.
  let startupWorkspaceId: string | null = null;
  const env = await getScanApiEnv();
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
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
        />
      </div>
      <AuditDashboardOverview view={view} />
    </div>
  );
}
