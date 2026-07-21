import { z } from 'zod';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { structuredLog } from '@/lib/server/structured-log';

export const runtime = 'nodejs';

const uuid = z.string().uuid();

function page(title: string, body: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>` +
      `<body style="font-family:Georgia,serif;max-width:560px;margin:80px auto;padding:0 20px;color:#1a1a1a;">` +
      `<p style="letter-spacing:0.2em;font-size:11px;color:#8a7a4a;">GEO-PULSE</p>` +
      `<h1 style="font-size:22px;">${title}</h1><p style="line-height:1.6;color:#444;">${body}</p></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

/**
 * CASL unsubscribe (issue #97). A GET from the email footer — must always succeed
 * from the recipient's point of view, never error, never require a login.
 * Fail-soft pre-migration-056: enabled=false alone still stops all sends.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ prospectId: string }> }
): Promise<Response> {
  const { prospectId } = await context.params;
  const done = page(
    'You are unsubscribed',
    'You will not receive any further audit emails from us. If this was a mistake, just reply to the last email you received.'
  );

  const parsed = uuid.safeParse(prospectId);
  if (!parsed.success) return done; // never leak validity to probes

  try {
    const env = await getScanApiEnv();
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return done;
    const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('outreach_prospects')
      .update({ enabled: false, unsubscribed_at: nowIso, updated_at: nowIso })
      .eq('id', parsed.data);
    if (error) {
      // Column missing pre-migration — the part that stops sends must still land.
      await supabase
        .from('outreach_prospects')
        .update({ enabled: false, updated_at: nowIso })
        .eq('id', parsed.data);
    }
    structuredLog('outreach_unsubscribed', { prospectId: parsed.data }, 'info');
  } catch {
    /* the recipient always gets the confirmation page */
  }

  return done;
}
