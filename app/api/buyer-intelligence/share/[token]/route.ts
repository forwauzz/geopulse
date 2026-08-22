import { getScanApiEnv } from '@/lib/server/cf-env';
import { verifyBuyerIntelligenceShareCapability } from '@/lib/server/buyer-intelligence-share-capability';
import { loadBuyerIntelligenceShareTarget } from '@/lib/server/buyer-intelligence-share-target';
import { resolveReportFilesBucket } from '@/lib/server/report-branding-settings';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  const env = await getScanApiEnv(); const { token } = await context.params;
  const secret = env.AUDIT_REPORT_CAPABILITY_SECRET?.trim();
  if (!secret || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'report_unavailable' }, { status: 503 });
  }
  const verified = verifyBuyerIntelligenceShareCapability({ token, secret, nowMs: Date.now() });
  if (!verified.ok) return Response.json({ error: verified.code }, { status: verified.code === 'expired' ? 410 : 403 });
  const target = await loadBuyerIntelligenceShareTarget({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    payload: verified.payload,
  });
  if (!target) return Response.json({ error: 'report_target_mismatch' }, { status: 403 });
  const bucket = await resolveReportFilesBucket();
  const object = bucket ? await bucket.get(target.generation.artifactR2Key!) : null;
  if (!object) return Response.json({ error: 'report_unavailable' }, { status: 404 });
  const download = new URL(request.url).searchParams.get('download') === '1';
  return new Response(await object.arrayBuffer(), { headers: {
    'content-type': 'application/pdf',
    'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${verified.payload.domain}-buyer-intelligence.pdf"`,
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
  } });
}
