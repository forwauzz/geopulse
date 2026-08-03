import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertRequiredSocialOAuthScopes,
  buildSocialOAuthAuthorizeUrl,
  exchangeSocialOAuthCode,
  fetchXOAuthProfile,
  refreshSocialOAuthToken,
  sanitizeOAuthTokenMetadata,
  validateSignedOAuthState,
  X_REQUIRED_PUBLISH_SCOPES,
} from '@/lib/server/distribution-social-oauth';
import { LINKEDIN_COMPANY_REQUIRED_SCOPES } from '@/lib/server/linkedin-company-publishing';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('distribution-social-oauth', () => {
  it('builds and validates signed state for X oauth start', () => {
    const url = buildSocialOAuthAuthorizeUrl({
      provider: 'x',
      accountId: 'acct-row-1',
      userId: 'user-1',
      appUrl: 'https://getgeopulse.com',
      stateSecret: 'secret',
      xClientId: 'x-client-id',
    });

    const parsed = new URL(url);
    const state = parsed.searchParams.get('state');
    expect(state).toBeTruthy();
    const validated = validateSignedOAuthState(state!, 'secret', {
      provider: 'x',
      userId: 'user-1',
    });
    expect(validated?.accountId).toBe('acct-row-1');
    expect(validated?.provider).toBe('x');
    expect(validated?.codeVerifier).toBeTruthy();
    expect(parsed.searchParams.get('scope')?.split(' ')).toEqual(X_REQUIRED_PUBLISH_SCOPES);
  });

  it('fails closed when X omits any required publishing scope', () => {
    expect(() =>
      assertRequiredSocialOAuthScopes('x', [
        'tweet.read',
        'tweet.write',
        'users.read',
        'offline.access',
      ])
    ).toThrow('media.write');
    expect(() =>
      assertRequiredSocialOAuthScopes('x', [...X_REQUIRED_PUBLISH_SCOPES])
    ).not.toThrow();
    expect(() =>
      assertRequiredSocialOAuthScopes('x', [...X_REQUIRED_PUBLISH_SCOPES, 'dm.write'])
    ).toThrow('unapproved scopes');
    expect(() =>
      buildSocialOAuthAuthorizeUrl({
        provider: 'x',
        accountId: 'acct-row-1',
        userId: 'user-1',
        appUrl: 'https://getgeopulse.com',
        stateSecret: 'secret',
        xClientId: 'x-client-id',
        xScope: `${X_REQUIRED_PUBLISH_SCOPES.join(' ')} dm.write`,
      })
    ).toThrow('unapproved scopes');
  });

  it('verifies the connected X identity with a read-only request', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: {
            id: 'x-user-1',
            username: 'get_geopulse',
            name: 'GEO-Pulse',
            profile_image_url: 'https://pbs.twimg.com/profile_images/geopulse.jpg',
          },
        }),
    } as Response) as typeof fetch;

    await expect(fetchXOAuthProfile({ accessToken: 'access-token' })).resolves.toEqual({
      id: 'x-user-1',
      username: 'get_geopulse',
      name: 'GEO-Pulse',
      profileImageUrl: 'https://pbs.twimg.com/profile_images/geopulse.jpg',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.x.com/2/users/me?user.fields=username,name,profile_image_url',
      {
        headers: {
          Authorization: 'Bearer access-token',
        },
      }
    );
  });

  it('classifies an X identity provider HTTP failure without exposing its body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => '{"detail":"provider billing response"}',
    } as Response) as typeof fetch;

    await expect(
      fetchXOAuthProfile({ accessToken: 'access-token' })
    ).rejects.toMatchObject({
      name: 'SocialOAuthProviderError',
      message: 'Social OAuth provider operation failed: provider_http_402.',
      reason: 'provider_http_402',
    });
  });

  it('removes token material from stored OAuth response metadata', () => {
    expect(
      sanitizeOAuthTokenMetadata({
        access_token: 'secret-access',
        refresh_token: 'secret-refresh',
        token_type: 'bearer',
        expires_in: 7200,
        scope: 'tweet.read tweet.write users.read media.write offline.access',
      })
    ).toEqual({
      token_type: 'bearer',
      expires_in: 7200,
      scope: 'tweet.read tweet.write users.read media.write offline.access',
    });
  });

  it('rejects state for the wrong user', () => {
    const url = buildSocialOAuthAuthorizeUrl({
      provider: 'linkedin',
      accountId: 'acct-row-2',
      userId: 'user-2',
      appUrl: 'https://getgeopulse.com',
      stateSecret: 'secret',
      linkedinClientId: 'linkedin-client-id',
    });
    const parsed = new URL(url);
    const state = parsed.searchParams.get('state');
    expect(state).toBeTruthy();
    const validated = validateSignedOAuthState(state!, 'secret', {
      provider: 'linkedin',
      userId: 'user-other',
    });
    expect(validated).toBeNull();
  });

  it('requests only Company Page scopes for LinkedIn', () => {
    const url = new URL(
      buildSocialOAuthAuthorizeUrl({
        provider: 'linkedin',
        accountId: 'acct-linkedin',
        userId: 'user-1',
        appUrl: 'https://getgeopulse.com',
        stateSecret: 'secret',
        linkedinClientId: 'linkedin-client-id',
      })
    );
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(
      LINKEDIN_COMPANY_REQUIRED_SCOPES
    );
  });

  it('builds Instagram Login with only publishing and insights scopes', () => {
    const url = new URL(
      buildSocialOAuthAuthorizeUrl({
        provider: 'instagram',
        accountId: 'acct-instagram',
        userId: 'user-1',
        appUrl: 'https://getgeopulse.com',
        stateSecret: 'secret',
        instagramClientId: '1854026362641864',
      })
    );
    expect(url.origin).toBe('https://www.instagram.com');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://getgeopulse.com/api/admin/distribution/oauth/instagram/callback'
    );
    expect(url.searchParams.get('scope')).toBe(
      'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights'
    );
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('exchanges linkedin code into normalized token payload', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          scope: 'rw_organization_admin w_organization_social',
        }),
    } as Response) as typeof fetch;

    const token = await exchangeSocialOAuthCode({
      provider: 'linkedin',
      code: 'code',
      appUrl: 'https://getgeopulse.com',
      linkedinClientId: 'linkedin-client-id',
      linkedinClientSecret: 'linkedin-client-secret',
    });

    expect(token.accessToken).toBe('access-token');
    expect(token.refreshToken).toBe('refresh-token');
    expect(token.scopeList).toEqual(['rw_organization_admin', 'w_organization_social']);
    expect(token.expiresAt).toBeTruthy();
  });

  it('uses HTTP Basic authentication for an X confidential-client code exchange', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 7200,
          scope: 'tweet.read tweet.write users.read media.write offline.access',
        }),
    } as Response) as typeof fetch;

    await exchangeSocialOAuthCode({
      provider: 'x',
      code: 'authorization-code',
      appUrl: 'https://getgeopulse.com',
      codeVerifier: 'pkce-verifier',
      xClientId: 'x-client-id',
      xClientSecret: 'x-client-secret',
    });

    const [, request] = vi.mocked(global.fetch).mock.calls[0]!;
    const body = new URLSearchParams(String(request?.body));
    expect(request?.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa('x-client-id:x-client-secret')}`,
    });
    expect(body.get('client_id')).toBeNull();
    expect(body.get('client_secret')).toBeNull();
    expect(body.get('code_verifier')).toBe('pkce-verifier');
  });
  it('refreshes x oauth token into normalized payload', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 7200,
          scope: 'tweet.read tweet.write users.read media.write offline.access',
        }),
    } as Response) as typeof fetch;

    const token = await refreshSocialOAuthToken({
      provider: 'x',
      refreshToken: 'old-refresh-token',
      xClientId: 'x-client-id',
      xClientSecret: 'x-client-secret',
    });

    expect(token.accessToken).toBe('new-access-token');
    expect(token.refreshToken).toBe('new-refresh-token');
    expect(token.scopeList).toEqual(['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access']);
    expect(token.expiresAt).toBeTruthy();
    const [, request] = vi.mocked(global.fetch).mock.calls[0]!;
    const body = new URLSearchParams(String(request?.body));
    expect(request?.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa('x-client-id:x-client-secret')}`,
    });
    expect(body.get('client_id')).toBeNull();
    expect(body.get('client_secret')).toBeNull();
    expect(body.get('refresh_token')).toBe('old-refresh-token');
  });

  it('refreshes linkedin oauth token into normalized payload', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          access_token: 'linkedin-new-access-token',
          refresh_token: 'linkedin-new-refresh-token',
          expires_in: 5400,
          scope: 'rw_organization_admin w_organization_social',
        }),
    } as Response) as typeof fetch;

    const token = await refreshSocialOAuthToken({
      provider: 'linkedin',
      refreshToken: 'linkedin-old-refresh-token',
      linkedinClientId: 'linkedin-client-id',
      linkedinClientSecret: 'linkedin-client-secret',
    });

    expect(token.accessToken).toBe('linkedin-new-access-token');
    expect(token.refreshToken).toBe('linkedin-new-refresh-token');
    expect(token.scopeList).toEqual(['rw_organization_admin', 'w_organization_social']);
    expect(token.expiresAt).toBeTruthy();
  });

  it('exchanges and refreshes a long-lived Instagram token', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'short', user_id: 'ig-123' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ access_token: 'long', token_type: 'bearer', expires_in: 5_184_000 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ access_token: 'refreshed', token_type: 'bearer', expires_in: 5_184_000 }),
      } as Response) as typeof fetch;

    const token = await exchangeSocialOAuthCode({
      provider: 'instagram',
      code: 'code',
      appUrl: 'https://getgeopulse.com',
      instagramClientId: 'instagram-client',
      instagramClientSecret: 'instagram-secret',
    });
    expect(token.accessToken).toBe('long');
    expect(token.refreshToken).toBe('long');
    expect(token.raw).toMatchObject({ user_id: 'ig-123' });

    const refreshed = await refreshSocialOAuthToken({
      provider: 'instagram',
      refreshToken: token.refreshToken!,
    });
    expect(refreshed.accessToken).toBe('refreshed');
    expect(refreshed.refreshToken).toBe('refreshed');
  });
});
