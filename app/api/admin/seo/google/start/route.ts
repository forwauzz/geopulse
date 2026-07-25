import { NextResponse } from 'next/server';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { buildGoogleSearchConsoleAuthorizeUrl } from '@/lib/server/seo-providers';
import { signSeoOAuthState } from '@/lib/server/seo-token-crypto';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return NextResponse.redirect(new URL('/login', 'https://getgeopulse.com'));
  const env = await getPaymentApiEnv();
  if (!env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID || !env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET || !env.NEXT_PUBLIC_APP_URL) {
    return NextResponse.json({ error: 'Google Search Console OAuth is not configured.' }, { status: 503 });
  }
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  const redirectUri = `${appUrl}/api/connectors/google-search-console/callback`;
  const state = await signSeoOAuthState({
    userId: ctx.user.id,
    returnTo: '/admin/automation',
    issuedAt: Date.now(),
    nonce: crypto.randomUUID(),
  }, env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET);
  return NextResponse.redirect(buildGoogleSearchConsoleAuthorizeUrl({
    clientId: env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID,
    redirectUri,
    state,
  }));
}
