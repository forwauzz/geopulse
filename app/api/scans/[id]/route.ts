import { z } from 'zod';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';

const uuid = z.string().uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const parsed = uuid.safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: { code: 'invalid_id', message: 'Invalid scan id' } }, { status: 400 });
  }

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: { code: 'server_misconfigured' } }, { status: 503 });
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('scans')
    .select('id,url,domain,score,letter_grade,issues_json,created_at,user_id')
    .eq('id', parsed.data)
    .maybeSingle();

  if (error) {
    return Response.json({ error: { code: 'db_error', message: error.message } }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: { code: 'not_found' } }, { status: 404 });
  }

  if (data.user_id !== null) {
    return Response.json({ error: { code: 'forbidden' } }, { status: 403 });
  }

  const created = new Date(data.created_at);
  const maxAgeMs = 48 * 60 * 60 * 1000;
  if (Number.isFinite(created.getTime()) && Date.now() - created.getTime() > maxAgeMs) {
    return Response.json({ error: { code: 'expired' } }, { status: 410 });
  }

  return Response.json({
    scanId: data.id,
    url: data.url,
    domain: data.domain,
    score: data.score,
    letterGrade: data.letter_grade,
    topIssues: extractTopIssues(data.issues_json),
  });
}

function extractTopIssues(raw: unknown): unknown {
  if (!Array.isArray(raw)) return [];
  const failed = raw.filter((x) => x && typeof x === 'object' && (x as { passed?: boolean }).passed === false);
  failed.sort(
    (a, b) =>
      Number((b as { weight?: number }).weight ?? 0) - Number((a as { weight?: number }).weight ?? 0)
  );
  return failed.slice(0, 3);
}
