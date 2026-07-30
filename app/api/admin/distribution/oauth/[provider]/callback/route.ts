import { NextResponse, type NextRequest } from 'next/server';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { createDistributionEngineRepository } from '@/lib/server/distribution-engine-repository';
import {
  assertRequiredSocialOAuthScopes,
  exchangeSocialOAuthCode,
  fetchInstagramOAuthProfile,
  fetchXOAuthProfile,
  readSocialOAuthFailureReason,
  sanitizeOAuthTokenMetadata,
  validateSignedOAuthState,
  type SocialOAuthProvider,
} from '@/lib/server/distribution-social-oauth';
import { encryptDistributionToken } from '@/lib/server/distribution-token-crypto';
import { resolveDistributionEngineFlags } from '@/lib/server/distribution-engine-flags';
import {
  resolveDistributionOAuthAppUrl,
  resolveDistributionOAuthCallbackConfig,
} from '@/lib/server/distribution-oauth-callback-env';
import {
  buildDistributionOAuthFailureLog,
  buildDistributionOAuthFailureOutcome,
  type DistributionOAuthCallbackStage,
} from '@/lib/server/distribution-oauth-callback-diagnostics';
import { isDistributionOAuthAdmin } from '@/lib/server/distribution-oauth-admin-gate';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function toProvider(value: string): SocialOAuthProvider | null {
  return value === 'x' || value === 'linkedin' || value === 'instagram' ? value : null;
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

  const env = await getPaymentApiEnv();
  const flags = resolveDistributionEngineFlags(env);
  const appUrl = resolveDistributionOAuthAppUrl(process.env, env, request.nextUrl.origin);
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
  const oauthConfig = resolveDistributionOAuthCallbackConfig(process.env, env);
  let callbackStage: DistributionOAuthCallbackStage = 'token_exchange';

  try {
    const token = await exchangeSocialOAuthCode({
      provider,
      code,
      appUrl,
      codeVerifier: statePayload.codeVerifier,
      ...oauthConfig,
    });
    callbackStage = 'scope_validation';
    assertRequiredSocialOAuthScopes(provider, token.scopeList);

    callbackStage = 'identity_verification';
    const instagramProfile =
      provider === 'instagram'
        ? await fetchInstagramOAuthProfile({
            accessToken: token.accessToken,
            graphBaseUrl: process.env['INSTAGRAM_GRAPH_API_BASE_URL'],
          })
        : null;
    const xProfile =
      provider === 'x'
        ? await fetchXOAuthProfile({
            accessToken: token.accessToken,
            apiBaseUrl: env.X_API_BASE_URL,
          })
        : null;
    const expectedXUsername =
      provider === 'x' && typeof account.metadata?.['expected_username'] === 'string'
        ? String(account.metadata['expected_username']).replace(/^@/, '').trim().toLowerCase()
        : null;
    if (
      xProfile &&
      expectedXUsername &&
      xProfile.username.trim().toLowerCase() !== expectedXUsername
    ) {
      throw new Error(
        `X OAuth connected @${xProfile.username}, expected @${expectedXUsername}.`
      );
    }

    callbackStage = 'token_encryption';
    const tokenEncryptionKey = env.DISTRIBUTION_TOKEN_ENCRYPTION_KEY?.trim();
    if (!tokenEncryptionKey) {
      throw new Error('Distribution token encryption is not configured.');
    }
    const accessTokenEncrypted = await encryptDistributionToken(
      token.accessToken,
      tokenEncryptionKey
    );
    const refreshTokenEncrypted = token.refreshToken
      ? await encryptDistributionToken(token.refreshToken, tokenEncryptionKey)
      : null;

    callbackStage = 'token_persistence';
    await repo.upsertAccountToken({
      distributionAccountId: account.id,
      tokenType: 'oauth',
      accessTokenEncrypted,
      refreshTokenEncrypted,
      expiresAt: token.expiresAt,
      scopes: token.scopeList,
      metadata: {
        source: 'provider_oauth_callback',
        provider,
        connected_by_user_id: user.id,
        raw: sanitizeOAuthTokenMetadata(token.raw),
      },
    });

    const authorUrnFromToken = provider === 'linkedin'
      ? typeof (token.raw as Record<string, unknown>)['id_token_sub'] === 'string'
        ? String((token.raw as Record<string, unknown>)['id_token_sub'])
        : null
      : null;

    callbackStage = 'account_persistence';
    await repo.upsertAccount({
      accountId: account.account_id,
      providerName: account.provider_name,
      accountLabel: account.account_label,
      externalAccountId:
        xProfile?.id ?? instagramProfile?.userId ?? account.external_account_id,
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
        ...(instagramProfile
          ? {
              instagram_user_id: instagramProfile.userId,
              instagram_username: instagramProfile.username,
              instagram_account_type: instagramProfile.accountType,
            }
          : {}),
        ...(xProfile
          ? {
              x_user_id: xProfile.id,
              x_username: xProfile.username,
              x_name: xProfile.name,
              x_profile_image_url: xProfile.profileImageUrl,
              x_identity_verified_at: new Date().toISOString(),
            }
          : {}),
      },
    });
  } catch (error) {
    const failureReason = readSocialOAuthFailureReason(error);
    console.error(
      JSON.stringify(
        buildDistributionOAuthFailureLog(provider, callbackStage, failureReason)
      )
    );
    return buildRedirect(
      appUrl,
      buildDistributionOAuthFailureOutcome(callbackStage, failureReason),
      provider
    );
  }

  return buildRedirect(appUrl, 'connected', provider);
}
