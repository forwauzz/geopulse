import { NextRequest, NextResponse } from 'next/server';
import { exchangeBrevoCode } from '@/lib/connectors/providers/brevo';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';
import { createBrevoConnectorRepository } from '@/lib/server/brevo-connector-repository';
import { hashBrevoOAuthState, verifyBrevoOAuthState } from '@/lib/server/brevo-oauth-state';
import { structuredError, structuredLog } from '@/lib/server/structured-log';

export const dynamic = 'force-dynamic';

function destination(appUrl: string, agencyAccountId: string, status: string): URL {
  const url = new URL('/dashboard/clients/brevo', appUrl);
  if (agencyAccountId) url.searchParams.set('agencyAccount', agencyAccountId);
  url.searchParams.set('brevo', status);
  return url;
}

export async function GET(request: NextRequest): Promise<Response> {
  const env = await getScanApiEnv();
  const appUrl = env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const rawState = request.nextUrl.searchParams.get('state') ?? '';
  const code = request.nextUrl.searchParams.get('code') ?? '';
  if (!rawState || !env.BREVO_OAUTH_CLIENT_ID || !env.BREVO_OAUTH_CLIENT_SECRET
    || !env.DISTRIBUTION_TOKEN_ENCRYPTION_KEY) {
    return NextResponse.redirect(destination(appUrl, '', 'configuration-error'));
  }
  const state = await verifyBrevoOAuthState(rawState, env.BREVO_OAUTH_CLIENT_SECRET);
  if (!state) return NextResponse.redirect(destination(appUrl, '', 'authorization-error'));
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user || user.id !== state.userId) {
    return NextResponse.redirect(destination(appUrl, state.agencyAccountId, 'authorization-error'));
  }
  const workspace = await loadCurrentAgencyWorkspace({
    userId: user.id, supabase: session, selectedAccountId: state.agencyAccountId,
  });
  if (!workspace || workspace.data.selectedAccountId !== state.agencyAccountId) {
    return NextResponse.redirect(destination(appUrl, state.agencyAccountId, 'authorization-error'));
  }
  const repository = createBrevoConnectorRepository(workspace.admin);
  const consumed = await repository.consumeOAuthState({
    stateHash: await hashBrevoOAuthState(rawState), agencyAccountId: state.agencyAccountId, userId: user.id,
  });
  if (!consumed) return NextResponse.redirect(destination(appUrl, state.agencyAccountId, 'state-expired'));
  if (request.nextUrl.searchParams.has('error') || !code) {
    return NextResponse.redirect(destination(appUrl, state.agencyAccountId, 'access-denied'));
  }
  const { data: membership } = await workspace.admin.from('agency_users').select('role')
    .eq('agency_account_id', state.agencyAccountId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
  if (!membership || membership.role === 'viewer') {
    return NextResponse.redirect(destination(appUrl, state.agencyAccountId, 'authorization-error'));
  }
  try {
    const redirectUri = `${appUrl.replace(/\/+$/, '')}/api/connectors/brevo/callback`;
    const token = await exchangeBrevoCode({
      clientId: env.BREVO_OAUTH_CLIENT_ID,
      clientSecret: env.BREVO_OAUTH_CLIENT_SECRET,
      code,
      redirectUri,
    });
    await repository.connect({
      agencyAccountId: state.agencyAccountId, userId: user.id, token,
      encryptionKey: env.DISTRIBUTION_TOKEN_ENCRYPTION_KEY,
    });
    structuredLog('brevo_connector_connected', {
      agency_account_id: state.agencyAccountId, user_id: user.id, scopes: token.scopes.join(' '),
    });
    return NextResponse.redirect(destination(appUrl, state.agencyAccountId, 'connected'));
  } catch (error) {
    structuredError('brevo_connector_callback_failed', {
      agency_account_id: state.agencyAccountId,
      error_message: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.redirect(destination(appUrl, state.agencyAccountId, 'connection-failed'));
  }
}
