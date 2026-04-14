import { NextResponse, type NextRequest } from 'next/server';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { createDistributionEngineRepository } from '@/lib/server/distribution-engine-repository';
import {
  exchangeSocialOAuthCode,
  validateSignedOAuthState,
  type SocialOAuthProvider,
} from '@/lib/server/distribution-social-oauth';
import { resolveDistributionEngineFlags } from '@/lib/server/distribution-engine-flags';
import { isDistributionOAuthAdmin } from '@/lib/server/distribution-oauth-admin-gate';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function toProvider(value: string): SocialOAuthProvider | null {
  return value === 'x' || value === 'linkedin' ? value : null;
}

function buildRedirect(appUrl: string, outcome: string, provider: string): NextResponse {
  const target = new URL('/dashboard/distribution', appUrl);
  target.searchParams.set('oauth', outcome);
  target.searchParams.set('provider', provider);
  return NextResponse.redirect(target);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider: providerRaw } = await context.params;
  const provider = toProvider(providerRaw);
  if (!provider) {
    return NextResponse.json({ error: 'Unsupported OAuth provider.' }, { status: 404 });
  }

  const env = await getScanApiEnv();
  const flags = resolveDistributionEngineFlags(env);
  const appUrl = (process.env['NEXT_PUBLIC_APP_URL'] || env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).trim();
  if (!flags.socialOauthEnabled) {
    return buildRedirect(appUrl, 'feature_flag_off', provider);
  }

  const supabaseSession = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabaseSession.auth.getUser();
  if (!user) {
    return buildRedirect(appUrl, 'admin_required', provider);
  }

  const serviceKeyRaw = (process.env['SUPABASE_SERVICE_ROLE_KEY'] || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const allowed = await isDistributionOAuthAdmin(
    user.id,
    user.email,
    env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKeyRaw || undefined,
  );
  if (!allowed) {
    return buildRedirect(appUrl, 'admin_required', provider);
  }

  const stateSecret = serviceKeyRaw;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !stateSecret) {
    return buildRedirect(appUrl, 'config_error', provider);
  }

  const errorText = request.nextUrl.searchParams.get('error');
  if (errorText) {
    return buildRedirect(appUrl, 'oauth_denied', provider);
  }

  const code = request.nextUrl.searchParams.get('code')?.trim() || '';
  const state = request.nextUrl.searchParams.get('state')?.trim() || '';
  if (!code || !state) {
    return buildRedirect(appUrl, 'missing_code_or_state', provider);
  }

  const statePayload = validateSignedOAuthState(state, stateSecret, {
    provider,
    userId: user.id,
  });
  if (!statePayload) {
    return buildRedirect(appUrl, 'invalid_state', provider);
  }

  const adminDb = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, stateSecret);
  const repo = createDistributionEngineRepository(adminDb as any);
  const account = await repo.getAccountById(statePayload.accountId);
  if (!account || account.provider_name !== provider) {
    return buildRedirect(appUrl, 'account_mismatch', provider);
  }

  try {
    const token = await exchangeSocialOAuthCode({
      provider,
      code,
      appUrl,
      codeVerifier: statePayload.codeVerifier,
      xClientId: process.env['X_OAUTH_CLIENT_ID'],
      xClientSecret: process.env['X_OAUTH_CLIENT_SECRET'],
      xTokenUrl: process.env['X_OAUTH_TOKEN_URL'],
      linkedinClientId: process.env['LINKEDIN_OAUTH_CLIENT_ID'],
      linkedinClientSecret: process.env['LINKEDIN_OAUTH_CLIENT_SECRET'],
      linkedinTokenUrl: process.env['LINKEDIN_OAUTH_TOKEN_URL'],
    });

    await repo.upsertAccountToken({
      distributionAccountId: account.id,
      tokenType: 'oauth',
      accessTokenEncrypted: token.accessToken,
      refreshTokenEncrypted: token.refreshToken,
      expiresAt: token.expiresAt,
      scopes: token.scopeList,
      metadata: {
        source: 'provider_oauth_callback',
        provider,
        connected_by_user_id: user.id,
        raw: token.raw,
      },
    });

    const authorUrnFromToken = provider === 'linkedin'
      ? typeof (token.raw as Record<string, unknown>)['id_token_sub'] === 'string'
        ? String((token.raw as Record<string, unknown>)['id_token_sub'])
        : null
      : null;

    await repo.upsertAccount({
      accountId: account.account_id,
      providerName: account.provider_name,
      accountLabel: account.account_label,
      externalAccountId: account.external_account_id,
      status: 'connected',
      defaultAudienceId: account.default_audience_id,
      connectedByUserId: account.connected_by_user_id ?? user.id,
      lastVerifiedAt: new Date().toISOString(),
      metadata: {
        ...account.metadata,
        oauth_connected_at: new Date().toISOString(),
        oauth_connected_by_user_id: user.id,
        ...(provider === 'linkedin' && account.external_account_id
          ? { author_urn: account.external_account_id }
          : {}),
        ...(provider === 'linkedin' && authorUrnFromToken ? { author_urn: authorUrnFromToken } : {}),
      },
    });
  } catch {
    return buildRedirect(appUrl, 'token_exchange_failed', provider);
  }

  return buildRedirect(appUrl, 'connected', provider);
}
