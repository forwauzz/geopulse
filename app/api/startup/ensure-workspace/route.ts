import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { ensureStartupWorkspace } from '@/lib/server/startup-workspace-ensure';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { structuredError } from '@/lib/server/structured-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serviceUnavailable(stage: string, error?: unknown): Response {
  structuredError('startup_workspace_recovery_unavailable', {
    stage,
    errorCode:
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? 'unknown')
        : 'unknown',
  });
  return Response.json(
    {
      error: {
        code: 'service_unavailable',
        message: 'Workspace setup is temporarily unavailable. Please try again shortly.',
      },
    },
    {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': '300',
      },
    }
  );
}

export async function POST(): Promise<Response> {
  let sessionClient;
  try {
    sessionClient = await createSupabaseServerClient();
  } catch (error) {
    return serviceUnavailable('session_client', error);
  }

  let authResult;
  try {
    authResult = await sessionClient.auth.getUser();
  } catch (error) {
    return serviceUnavailable('auth_lookup', error);
  }
  if (authResult.error) return serviceUnavailable('auth_lookup', authResult.error);
  const user = authResult.data.user;

  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const env = await getPaymentApiEnv();

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'server_misconfigured' }, { status: 503 });
  }

  if (!env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'stripe_not_configured' }, { status: 503 });
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  let result;
  try {
    result = await ensureStartupWorkspace({
      supabase,
      stripeSecretKey: env.STRIPE_SECRET_KEY,
      userId: user.id,
    });
  } catch (error) {
    return serviceUnavailable('workspace_recovery', error);
  }

  if (result.kind === 'already_exists' || result.kind === 'provisioned') {
    return Response.json({ ok: true, kind: result.kind, workspaceId: result.workspaceId });
  }

  if (result.kind === 'no_stripe_customer' || result.kind === 'no_stripe_subscription') {
    // User hasn't completed checkout — send them back to pricing
    return Response.json({ ok: false, kind: result.kind, redirectTo: '/pricing?onboarding=1' });
  }

  if (result.kind === 'database_unavailable') {
    return serviceUnavailable(result.stage);
  }

  if (result.kind === 'provider_unavailable') {
    return serviceUnavailable(`${result.provider}_lookup`);
  }

  return serviceUnavailable('workspace_provision');
}
