import { getScanApiEnv } from '@/lib/server/cf-env';
import { buildScanProgress } from '@/lib/server/scan-progress';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';

/**
 * Live progress for a scan's full-audit run. Same access model as `/api/scans/[id]`: the scan id
 * is the capability. Returns only progress facts (counts + the URL currently being reviewed on the
 * customer's own site) — no findings, no scores.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  if (!id || id.length > 64) {
    return Response.json({ error: { code: 'bad_request' } }, { status: 400 });
  }

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: { code: 'not_configured' } }, { status: 503 });
  }
  const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: run } = await supabase
      .from('scan_runs')
      .select('id, config')
      .eq('scan_id', id)
      .maybeSingle();

    let pageLimit: number | null = null;
    let pagesDone = 0;
    let latestPageUrl: string | null = null;

    if (run?.id) {
      const config = run.config as Record<string, unknown> | null;
      const rawLimit = config?.['page_limit'];
      pageLimit = typeof rawLimit === 'number' && rawLimit > 0 ? rawLimit : null;

      const [{ count }, { data: latest }] = await Promise.all([
        supabase.from('scan_pages').select('id', { count: 'exact', head: true }).eq('run_id', run.id),
        supabase
          .from('scan_pages')
          .select('url')
          .eq('run_id', run.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      pagesDone = count ?? 0;
      latestPageUrl = (latest?.url as string | undefined) ?? null;
    }

    const { data: report } = await supabase
      .from('reports')
      .select('id')
      .eq('scan_id', id)
      .eq('type', 'deep_audit')
      .maybeSingle();

    return Response.json(
      buildScanProgress({
        pageLimit,
        pagesDone,
        latestPageUrl,
        reportDelivered: !!report?.id,
      }),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return Response.json(
      buildScanProgress({ pageLimit: null, pagesDone: 0, latestPageUrl: null, reportDelivered: false }),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
