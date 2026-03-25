import { getScanApiEnv } from '@/lib/server/cf-env';
import { marketingEventSchema, storeMarketingEvent } from '@/lib/server/marketing/events';

export const runtime = 'nodejs';

function unauthorized(): Response {
  return Response.json({ error: { code: 'unauthorized' } }, { status: 401 });
}

export async function POST(request: Request): Promise<Response> {
  const env = await getScanApiEnv();
  const expected = env.MARKETING_INGEST_KEY;

  if (!expected) {
    return Response.json(
      { error: { code: 'server_misconfigured', message: 'MARKETING_INGEST_KEY missing' } },
      { status: 503 }
    );
  }

  const auth = request.headers.get('authorization');
  if (!auth || auth !== `Bearer ${expected}`) {
    return unauthorized();
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: { code: 'bad_json', message: 'Invalid JSON' } }, { status: 400 });
  }

  const parsed = marketingEventSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'validation_error', message: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const result = await storeMarketingEvent(parsed.data);
  if (!result.ok) {
    return Response.json({ error: { code: 'store_failed', message: result.reason } }, { status: result.status });
  }

  return Response.json({ ok: true, duplicate: result.duplicate, eventId: result.id }, { status: 201 });
}
