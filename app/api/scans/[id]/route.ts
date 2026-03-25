import { getScanForPublicShare } from '@/lib/server/get-scan-for-public-share';
import { getScanApiEnv } from '@/lib/server/cf-env';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: { code: 'server_misconfigured' } }, { status: 503 });
  }

  const result = await getScanForPublicShare(id, env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  if (!result.ok) {
    if (result.code === 'invalid_id') {
      return Response.json(
        { error: { code: 'invalid_id', message: 'Invalid scan id' } },
        { status: 400 }
      );
    }
    if (result.code === 'db_error') {
      return Response.json(
        { error: { code: 'db_error', message: result.message ?? 'Database error' } },
        { status: 500 }
      );
    }
    if (result.code === 'not_found') {
      return Response.json({ error: { code: 'not_found' } }, { status: 404 });
    }
    if (result.code === 'forbidden') {
      return Response.json({ error: { code: 'forbidden' } }, { status: 403 });
    }
    if (result.code === 'expired') {
      return Response.json({ error: { code: 'expired' } }, { status: 410 });
    }
    return Response.json({ error: { code: 'unknown' } }, { status: 500 });
  }

  const { data } = result;
  return Response.json({
    scanId: data.scanId,
    url: data.url,
    domain: data.domain,
    score: data.score,
    letterGrade: data.letterGrade,
    topIssues: data.topIssues,
  });
}
