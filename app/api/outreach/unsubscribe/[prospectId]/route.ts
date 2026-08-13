import { z } from 'zod';
import { getClientIp, getScanApiEnv } from '@/lib/server/cf-env';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { structuredLog } from '@/lib/server/structured-log';
import { setLifecycleEmailSuppression } from '@/lib/server/lifecycle-email';
import { checkUnsubscribeRateLimit } from '@/lib/server/rate-limit-kv';

export const runtime = 'nodejs';

const uuid = z.string().uuid();

function page(title: string, body: string, action?: string): Response {
  const form = action
    ? `<form method="post" action="${action}"><button type="submit" style="border:0;border-radius:999px;background:#1a1a1a;color:#fff;padding:12px 20px;font:600 14px Arial,sans-serif;cursor:pointer;">Unsubscribe me</button></form>`
    : '';
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>` +
      `<body style="font-family:Georgia,serif;max-width:560px;margin:80px auto;padding:0 20px;color:#1a1a1a;">` +
      `<p style="letter-spacing:0.2em;font-size:11px;color:#8a7a4a;">GEO-PULSE</p>` +
      `<h1 style="font-size:22px;">${title}</h1><p style="line-height:1.6;color:#444;">${body}</p>${form}</body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

/** GET is confirmation-only because email-security scanners routinely prefetch links. */
export async function GET(
  request: Request,
  _context: { params: Promise<{ prospectId: string }> }
): Promise<Response> {
  return page(
    'Unsubscribe from audit emails?',
    'Confirm below and we will stop future marketing and audit emails to this address.',
    new URL(request.url).pathname,
  );
}

/** RFC 8058 one-click POST. Always return a blank 200 and never leak recipient validity. */
export async function POST(
  request: Request,
  context: { params: Promise<{ prospectId: string }> }
): Promise<Response> {
  const { prospectId } = await context.params;
  const accepted = new Response(null, { status: 200 });
  const parsed = uuid.safeParse(prospectId);
  if (!parsed.success) return accepted;

  try {
    const env = await getScanApiEnv();
    const rateLimit = await checkUnsubscribeRateLimit(env.SCAN_CACHE, parsed.data, getClientIp(request));
    if (!rateLimit.ok) {
      structuredLog('outreach_unsubscribe_rate_limited', { prospectId: parsed.data }, 'warning');
      return accepted;
    }
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return accepted;
    const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const nowIso = new Date().toISOString();
    const { data: prospect } = await supabase.from('outreach_prospects').select('email').eq('id', parsed.data).maybeSingle();
    const { error } = await supabase
      .from('outreach_prospects')
      .update({
        enabled: false,
        lifecycle_status: 'unsubscribed',
        unsubscribed_at: nowIso,
        exited_at: nowIso,
        exit_reason: 'unsubscribe',
        next_action: null,
        updated_at: nowIso,
      })
      .eq('id', parsed.data);
    if (error) {
      await supabase
        .from('outreach_prospects')
        .update({ enabled: false, updated_at: nowIso })
        .eq('id', parsed.data);
    }
    structuredLog('outreach_unsubscribed', { prospectId: parsed.data }, 'info');
    if (prospect?.email) {
      await setLifecycleEmailSuppression({
        supabase,
        email: String(prospect.email),
        scope: 'marketing',
        reason: 'unsubscribe',
        source: 'outreach_unsubscribe',
      });
    }
  } catch {
    // One-click clients always receive a successful acknowledgement.
  }

  return accepted;
}
