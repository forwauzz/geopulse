import { notFound } from 'next/navigation';
import { VisibilityScorecardReport } from '@/components/visibility-scorecard-report';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { resolveReportFilesPublicBase } from '@/lib/server/report-branding-settings';
import { loadVisibilityScorecard } from '@/lib/server/visibility-scorecard-service';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';
export const metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};

export default async function BusinessVisibilityScorecardPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ workspaceId: string }>;
  readonly searchParams: Promise<{ share?: string }>;
}) {
  const [{ workspaceId }, sp, env, reportFilesPublicBase] = await Promise.all([
    params,
    searchParams,
    getScanApiEnv(),
    resolveReportFilesPublicBase(),
  ]);
  if (!sp.share || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) notFound();
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const scorecard = await loadVisibilityScorecard({
    supabase: admin,
    subject: { kind: 'startup_workspace', id: workspaceId },
    shareToken: sp.share,
    reportFilesPublicBase,
  });
  if (!scorecard) notFound();
  return <VisibilityScorecardReport scorecard={scorecard} />;
}
