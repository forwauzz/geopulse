import { NextRequest, NextResponse } from 'next/server';
import { buildBrevoAuthorizeUrl } from '@/lib/connectors/providers/brevo';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';
import { createBrevoConnectorRepository } from '@/lib/server/brevo-connector-repository';
import { hashBrevoOAuthState, signBrevoOAuthState } from '@/lib/server/brevo-oauth-state';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const agencyAccountId = request.nextUrl.searchParams.get('agencyAccount')?.trim() ?? '';
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=/dashboard/clients/brevo', request.nextUrl.origin));
  const workspace = await loadCurrentAgencyWorkspace({
    userId: user.id, supabase: session, selectedAccountId: agencyAccountId,
  });
  if (!workspace || workspace.data.selectedAccountId !== agencyAccountId) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  const { data: membership } = await workspace.admin.from('agency_users').select('role')
    .eq('agency_account_id', agencyAccountId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
  if (!membership || membership.role === 'viewer') return Response.json({ error: 'forbidden' }, { status: 403 });

  const env = await getScanApiEnv();
  if (!env.BREVO_OAUTH_CLIENT_ID || !env.BREVO_OAUTH_CLIENT_SECRET || !env.NEXT_PUBLIC_APP_URL) {
    return Response.json({ error: 'brevo_oauth_not_configured' }, { status: 503 });
  }
  const issuedAt = Date.now();
  const state = await signBrevoOAuthState({
    userId: user.id, agencyAccountId, issuedAt, nonce: crypto.randomUUID(),
  }, env.BREVO_OAUTH_CLIENT_SECRET);
  await createBrevoConnectorRepository(workspace.admin).saveOAuthState({
    stateHash: await hashBrevoOAuthState(state), agencyAccountId, userId: user.id,
    expiresAt: new Date(issuedAt + 10 * 60 * 1000).toISOString(),
  });
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  return NextResponse.redirect(buildBrevoAuthorizeUrl({
    clientId: env.BREVO_OAUTH_CLIENT_ID,
    redirectUri: `${appUrl}/api/connectors/brevo/callback`,
    state,
  }));
}
