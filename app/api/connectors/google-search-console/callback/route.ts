import { NextRequest, NextResponse } from 'next/server';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { exchangeGoogleSearchConsoleCode, SEARCH_CONSOLE_SCOPE } from '@/lib/server/seo-providers';
import { encryptSeoToken, verifySeoOAuthState } from '@/lib/server/seo-token-crypto';

export const dynamic = 'force-dynamic';

function destination(appUrl: string, status: string): URL {
  const url = new URL('/admin/automation', appUrl);
  url.searchParams.set('seo', status);
  return url;
}

export async function GET(request: NextRequest): Promise<Response> {
  const env = await getPaymentApiEnv();
  const appUrl = env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get('code');
  const rawState = request.nextUrl.searchParams.get('state');
  if (
    !code ||
    !rawState ||
    !env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID ||
    !env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET ||
    !env.SEO_TOKEN_ENCRYPTION_KEY
  ) {
    return NextResponse.redirect(destination(appUrl, 'configuration-error'));
  }
  const [ctx, state] = await Promise.all([
    loadAdminActionContext(),
    verifySeoOAuthState(rawState, env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET),
  ]);
  if (!ctx.ok || !state || state.userId !== ctx.user.id) {
    return NextResponse.redirect(destination(appUrl, 'authorization-error'));
  }
  try {
    const redirectUri = `${appUrl.replace(/\/+$/, '')}/api/connectors/google-search-console/callback`;
    const tokens = await exchangeGoogleSearchConsoleCode({
      clientId: env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID,
      clientSecret: env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET,
      redirectUri,
      code,
    });
    const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: current } = await supabase
      .from('seo_provider_connections')
      .select('refresh_token_encrypted')
      .eq('provider', 'google_search_console')
      .maybeSingle();
    const { error } = await supabase.from('seo_provider_connections').upsert({
      provider: 'google_search_console',
      status: 'connected',
      site_url: 'sc-domain:getgeopulse.com',
      access_token_encrypted: await encryptSeoToken(tokens.accessToken, env.SEO_TOKEN_ENCRYPTION_KEY),
      refresh_token_encrypted: tokens.refreshToken
        ? await encryptSeoToken(tokens.refreshToken, env.SEO_TOKEN_ENCRYPTION_KEY)
        : current?.refresh_token_encrypted ?? null,
      expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
      scopes: (tokens.scope || SEARCH_CONSOLE_SCOPE).split(' '),
      metadata: { oauth_connected_at: new Date().toISOString() },
      last_error: null,
      connected_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider' });
    if (error) throw error;
    return NextResponse.redirect(destination(appUrl, 'connected'));
  } catch {
    return NextResponse.redirect(destination(appUrl, 'connection-failed'));
  }
}
