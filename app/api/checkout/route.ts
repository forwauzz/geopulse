import { z } from 'zod';
import { handleCheckoutSessionCompleted } from '@/lib/server/stripe/checkout-completed';
import {
  resolveAgencyFeatureEntitlements,
  resolveAgencyScanAccess,
} from '@/lib/server/agency-access';
import { getClientIp, getPaymentApiEnv } from '@/lib/server/cf-env';
import { checkCheckoutRateLimit } from '@/lib/server/rate-limit-kv';
import { createStripeClient } from '@/lib/server/stripe-client';
import { validateStartupWorkspaceScanContext } from '@/lib/server/startup-scan-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyTurnstileToken } from '@/lib/server/turnstile';
import { structuredLog } from '@/lib/server/structured-log';
import { emitMarketingEvent } from '@services/marketing-attribution/emit';

export const runtime = 'nodejs';

const bodySchema = z.object({
  scanId: z.string().uuid(),
  turnstileToken: z.string().min(1),
  anonymous_id: z.string().max(128).nullish(),
});

export async function POST(request: Request): Promise<Response> {
  const env = await getPaymentApiEnv();
  const ip = getClientIp(request);

  const rl = await checkCheckoutRateLimit(env.SCAN_CACHE, ip);
  if (!rl.ok) {
    return Response.json(
      { error: { code: 'rate_limited', message: 'Too many checkout attempts. Try again later.' } },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec ?? 3600) } }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: { code: 'bad_json', message: 'Invalid JSON' } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'validation_error', message: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const ts = await verifyTurnstileToken(env.TURNSTILE_SECRET_KEY, parsed.data.turnstileToken, ip);
  if (!ts.ok) {
    return Response.json(
      { error: { code: 'turnstile_failed', message: ts.error } },
      { status: 400 }
    );
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      { error: { code: 'server_misconfigured', message: 'Database not configured' } },
      { status: 503 }
    );
  }

  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  if (!baseUrl) {
    return Response.json(
      { error: { code: 'server_misconfigured', message: 'App URL not configured' } },
      { status: 503 }
    );
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: scan, error: scanErr } = await supabase
    .from('scans')
    .select('id,user_id,status,agency_account_id,agency_client_id,startup_workspace_id')
    .eq('id', parsed.data.scanId)
    .maybeSingle();

  if (scanErr) {
    return Response.json(
      { error: { code: 'db_error', message: scanErr.message } },
      { status: 500 }
    );
  }
  if (!scan || scan.status !== 'complete') {
    structuredLog('deep_audit_checkout_invalid_scan', {
      scanId: parsed.data.scanId,
      status: scan?.status ?? null,
      hasScan: !!scan,
    });
    return Response.json(
      { error: { code: 'invalid_scan', message: 'Scan is not eligible for checkout' } },
      { status: 400 }
    );
  }

  const scanId = parsed.data.scanId;

  let sessionUserId: string | null = null;
  let sessionUserEmail: string | null = null;
  try {
    const sessionClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();
    sessionUserId = user?.id ?? null;
    sessionUserEmail = user?.email?.trim().toLowerCase() ?? null;
  } catch {
    sessionUserId = null;
    sessionUserEmail = null;
  }

  if (sessionUserId && sessionUserEmail && scan.agency_account_id) {
    const canAccessAsOwner = scan.user_id === sessionUserId;
    const agencyAccess = await resolveAgencyScanAccess({
      supabase,
      userId: sessionUserId,
      scan: {
        agencyAccountId: scan.agency_account_id ?? null,
        agencyClientId: scan.agency_client_id ?? null,
      },
    });
    const entitlements = await resolveAgencyFeatureEntitlements({
      supabase,
      agencyAccountId: scan.agency_account_id ?? null,
      agencyClientId: scan.agency_client_id ?? null,
    });

    if ((canAccessAsOwner || agencyAccess.isMember) && !entitlements.deepAuditEnabled) {
      structuredLog('deep_audit_checkout_blocked', {
        scanId,
        userId: sessionUserId,
        agencyAccountId: scan.agency_account_id ?? null,
        agencyClientId: scan.agency_client_id ?? null,
        reason: 'deep_audit_disabled',
      });
      return Response.json(
        {
          error: {
            code: 'deep_audit_disabled',
            message: 'Deep audit is disabled for this agency client.',
          },
        },
        { status: 403 }
      );
    }

    if ((canAccessAsOwner || agencyAccess.isMember) && !agencyAccess.paymentRequired) {
      structuredLog('deep_audit_checkout_bypass_started', {
        scanId,
        userId: sessionUserId,
        agencyAccountId: scan.agency_account_id ?? null,
        agencyClientId: scan.agency_client_id ?? null,
        ownerAccess: canAccessAsOwner,
        agencyMemberAccess: agencyAccess.isMember,
      }, 'info');
      const syntheticSessionId = `agency-bypass:${scanId}`;
      const syntheticEventId = `agency-bypass-completed:${scanId}`;
      const result = await handleCheckoutSessionCompleted(
        supabase as any,
        {
          id: syntheticSessionId,
          metadata: { scan_id: scanId },
          customer_email: sessionUserEmail,
          customer_details: { email: sessionUserEmail },
          amount_total: 0,
          currency: 'usd',
        } as any,
        syntheticEventId,
        env
      );

      if (!result.ok) {
        return Response.json(
          { error: { code: result.reason, message: result.reason } },
          { status: result.status }
        );
      }

      return Response.json({ url: `${baseUrl}/results/${scanId}?checkout=success` });
    }
  }

  // Startup workspace bypass — members never pay; enqueue report via synthetic session
  if (sessionUserId && sessionUserEmail && scan.startup_workspace_id) {
    const isStartupMember = await validateStartupWorkspaceScanContext({
      supabase,
      userId: sessionUserId,
      startupWorkspaceId: scan.startup_workspace_id,
    });
    if (isStartupMember) {
      structuredLog('deep_audit_checkout_startup_bypass_started', {
        scanId,
        userId: sessionUserId,
        startupWorkspaceId: scan.startup_workspace_id,
      }, 'info');
      const syntheticSessionId = `startup-bypass:${scanId}`;
      const syntheticEventId = `startup-bypass-completed:${scanId}`;
      const result = await handleCheckoutSessionCompleted(
        supabase as any,
        {
          id: syntheticSessionId,
          metadata: { scan_id: scanId },
          customer_email: sessionUserEmail,
          customer_details: { email: sessionUserEmail },
          amount_total: 0,
          currency: 'usd',
        } as any,
        syntheticEventId,
        env
      );
      if (!result.ok) {
        return Response.json(
          { error: { code: result.reason, message: result.reason } },
          { status: result.status }
        );
      }
      return Response.json({ url: `${baseUrl}/results/${scanId}?checkout=success` });
    }
  }

  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID_DEEP_AUDIT) {
    return Response.json(
      { error: { code: 'server_misconfigured', message: 'Stripe is not configured' } },
      { status: 503 }
    );
  }

  const stripe = createStripeClient(env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: env.STRIPE_PRICE_ID_DEEP_AUDIT, quantity: 1 }],
      success_url: `${baseUrl}/results/${scanId}?checkout=success`,
      cancel_url: `${baseUrl}/results/${scanId}?checkout=cancel`,
      metadata: { scan_id: scanId },
    });

    if (!session.url) {
      return Response.json(
        { error: { code: 'stripe_error', message: 'Checkout URL not returned' } },
        { status: 502 }
      );
    }

    await emitMarketingEvent(supabase, 'checkout_started', {
      anonymous_id: parsed.data.anonymous_id,
      scan_id: scanId,
      metadata: { stripe_session_id: session.id },
    });

    structuredLog('deep_audit_checkout_stripe_redirect', {
      scanId,
      userId: sessionUserId,
      agencyAccountId: scan.agency_account_id ?? null,
      agencyClientId: scan.agency_client_id ?? null,
      ownerAccess: scan.user_id === sessionUserId,
      hasAgencyAccount: !!scan.agency_account_id,
      stripeSessionId: session.id,
    }, 'info');

    return Response.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'stripe_error';
    return Response.json({ error: { code: 'stripe_error', message: msg } }, { status: 502 });
  }
}
