import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { ensureStartupWorkspace } from '@/lib/server/startup-workspace-ensure';
import { getPaymentApiEnv } from '@/lib/server/cf-env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  const sessionClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

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

  const result = await ensureStartupWorkspace({
    supabase,
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    userId: user.id,
  });

  if (result.kind === 'already_exists' || result.kind === 'provisioned') {
    return Response.json({ ok: true, kind: result.kind, workspaceId: result.workspaceId });
  }

  if (result.kind === 'no_stripe_customer' || result.kind === 'no_stripe_subscription') {
    // User hasn't completed checkout — send them back to pricing
    return Response.json({ ok: false, kind: result.kind, redirectTo: '/pricing?onboarding=1' });
  }

  return Response.json({ ok: false, kind: result.kind }, { status: 500 });
}
