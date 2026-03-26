import { getScanApiEnv } from '@/lib/server/cf-env';
import { structuredLog } from '@/lib/server/structured-log';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { ingestEvent } from '@services/marketing-attribution/ingest';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const env = await getScanApiEnv();

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      { error: { code: 'server_misconfigured', message: 'Database not configured' } },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: 'bad_json', message: 'Invalid JSON' } },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const result = await ingestEvent(supabase, body);

  if (!result.ok) {
    structuredLog('marketing_ingest_rejected', {
      status: result.status,
      reason: typeof result.reason === 'string' ? result.reason : 'validation_error',
    });
    return Response.json(
      { error: { code: 'validation_error', message: result.reason } },
      { status: result.status }
    );
  }

  structuredLog('marketing_ingest_accepted', {
    event_id: result.event_id,
    duplicate: 'duplicate' in result && result.duplicate === true,
  });

  return Response.json(
    { ok: true, event_id: result.event_id },
    { status: result.status }
  );
}
