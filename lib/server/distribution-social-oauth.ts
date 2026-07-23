import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type SocialOAuthProvider = 'x' | 'linkedin' | 'instagram';

type OAuthStatePayload = {
  readonly provider: SocialOAuthProvider;
  readonly accountId: string;
  readonly userId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly nonce: string;
  readonly codeVerifier?: string;
};

export type ValidatedOAuthState = OAuthStatePayload;

type SocialOAuthStartInput = {
  readonly provider: SocialOAuthProvider;
  readonly accountId: string;
  readonly userId: string;
  readonly appUrl: string;
  readonly stateSecret: string;
  readonly xClientId?: string;
  readonly linkedinClientId?: string;
  readonly xAuthorizeUrl?: string;
  readonly linkedinAuthorizeUrl?: string;
  readonly xScope?: string;
  readonly linkedinScope?: string;
  readonly instagramClientId?: string;
  readonly instagramAuthorizeUrl?: string;
  readonly instagramScope?: string;
};

type SocialOAuthTokenExchangeInput = {
  readonly provider: SocialOAuthProvider;
  readonly code: string;
  readonly appUrl: string;
  readonly xClientId?: string;
  readonly xClientSecret?: string;
  readonly linkedinClientId?: string;
  readonly linkedinClientSecret?: string;
  readonly xTokenUrl?: string;
  readonly linkedinTokenUrl?: string;
  readonly instagramClientId?: string;
  readonly instagramClientSecret?: string;
  readonly instagramTokenUrl?: string;
  readonly instagramGraphBaseUrl?: string;
  readonly codeVerifier?: string;
};

type SocialOAuthTokenRefreshInput = {
  readonly provider: SocialOAuthProvider;
  readonly refreshToken: string;
  readonly xClientId?: string;
  readonly xClientSecret?: string;
  readonly xTokenUrl?: string;
  readonly linkedinClientId?: string;
  readonly linkedinClientSecret?: string;
  readonly linkedinTokenUrl?: string;
  readonly instagramGraphBaseUrl?: string;
};

export type SocialOAuthTokenResponse = {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: string | null;
  readonly scopeList: string[];
  readonly raw: Record<string, unknown>;
};

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('=', '')
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}

function base64UrlDecode(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${'='.repeat(padLength)}`;
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signState(encodedPayload: string, secret: string): string {
  return base64UrlEncode(createHmac('sha256', secret).update(encodedPayload).digest());
}

function buildSignedState(payload: OAuthStatePayload, secret: string): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signState(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function validateSignedOAuthState(
  state: string,
  secret: string,
  expected: {
    readonly provider: SocialOAuthProvider;
    readonly userId: string;
  }
): ValidatedOAuthState | null {
  const [encodedPayload, signature] = state.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signState(encodedPayload, secret);
  const provided = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (provided.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(provided, expectedBuf)) return null;

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as OAuthStatePayload;
  } catch {
    return null;
  }

  if (payload.provider !== expected.provider) return null;
  if (payload.userId !== expected.userId) return null;
  if (!payload.accountId || !payload.nonce) return null;
  if (typeof payload.issuedAt !== 'number' || typeof payload.expiresAt !== 'number') return null;
  if (payload.expiresAt <= Date.now()) return null;
  if (payload.expiresAt <= payload.issuedAt) return null;

  return payload;
}

function buildRedirectUri(appUrl: string, provider: SocialOAuthProvider): string {
  const base = appUrl.replace(/\/+$/, '');
  return `${base}/api/admin/distribution/oauth/${provider}/callback`;
}

function splitScopes(scopeValue: string | undefined, fallback: string): string[] {
  const resolved = scopeValue?.trim() || fallback;
  return resolved
    .split(/\s+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function buildSocialOAuthAuthorizeUrl(input: SocialOAuthStartInput): string {
  const now = Date.now();
  const expiresAt = now + 1000 * 60 * 10;
  const nonce = randomBytes(12).toString('hex');
  const redirectUri = buildRedirectUri(input.appUrl, input.provider);

  if (input.provider === 'x') {
    const clientId = input.xClientId?.trim() ?? '';
    if (!clientId) throw new Error('X OAuth is not configured: missing X_OAUTH_CLIENT_ID.');

    const codeVerifier = base64UrlEncode(randomBytes(32));
    const codeChallenge = base64UrlEncode(createHash('sha256').update(codeVerifier).digest());
    const state = buildSignedState(
      {
        provider: 'x',
        accountId: input.accountId,
        userId: input.userId,
        issuedAt: now,
        expiresAt,
        nonce,
        codeVerifier,
      },
      input.stateSecret
    );

    const url = new URL((input.xAuthorizeUrl?.trim() || 'https://twitter.com/i/oauth2/authorize').trim());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set(
      'scope',
      splitScopes(input.xScope, 'tweet.read tweet.write users.read offline.access').join(' ')
    );
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  if (input.provider === 'instagram') {
    const clientId = input.instagramClientId?.trim() ?? '';
    if (!clientId) {
      throw new Error('Instagram OAuth is not configured: missing INSTAGRAM_OAUTH_CLIENT_ID.');
    }
    const state = buildSignedState(
      {
        provider: 'instagram',
        accountId: input.accountId,
        userId: input.userId,
        issuedAt: now,
        expiresAt,
        nonce,
      },
      input.stateSecret
    );
    const url = new URL(
      (input.instagramAuthorizeUrl?.trim() || 'https://www.instagram.com/oauth/authorize').trim()
    );
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set(
      'scope',
      splitScopes(
        input.instagramScope,
        'instagram_business_basic instagram_business_content_publish instagram_business_manage_insights'
      ).join(',')
    );
    url.searchParams.set('state', state);
    url.searchParams.set('enable_fb_login', '0');
    url.searchParams.set('force_authentication', '1');
    return url.toString();
  }

  const clientId = input.linkedinClientId?.trim() ?? '';
  if (!clientId) throw new Error('LinkedIn OAuth is not configured: missing LINKEDIN_OAUTH_CLIENT_ID.');

  const state = buildSignedState(
    {
      provider: 'linkedin',
      accountId: input.accountId,
      userId: input.userId,
      issuedAt: now,
      expiresAt,
      nonce,
    },
    input.stateSecret
  );

  const url = new URL(
    (input.linkedinAuthorizeUrl?.trim() || 'https://www.linkedin.com/oauth/v2/authorization').trim()
  );
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set(
    'scope',
    splitScopes(input.linkedinScope, 'openid profile w_member_social').join(' ')
  );
  url.searchParams.set('state', state);
  return url.toString();
}

function readScopeList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function readExpiresAt(expiresInRaw: unknown): string | null {
  const parsed =
    typeof expiresInRaw === 'string'
      ? Number.parseInt(expiresInRaw, 10)
      : typeof expiresInRaw === 'number'
        ? expiresInRaw
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return new Date(Date.now() + parsed * 1000).toISOString();
}

function parseTokenExchangeResponse(rawText: string, providerLabel: string): SocialOAuthTokenResponse {
  const json = JSON.parse(rawText) as Record<string, unknown>;
  const accessToken =
    typeof json['access_token'] === 'string' ? String(json['access_token']).trim() : '';
  if (!accessToken) throw new Error(`${providerLabel} OAuth token exchange returned no access token.`);

  return {
    accessToken,
    refreshToken:
      typeof json['refresh_token'] === 'string' && String(json['refresh_token']).trim().length > 0
        ? String(json['refresh_token']).trim()
        : null,
    expiresAt: readExpiresAt(json['expires_in']),
    scopeList: readScopeList(json['scope']),
    raw: json,
  };
}

export async function exchangeSocialOAuthCode(
  input: SocialOAuthTokenExchangeInput
): Promise<SocialOAuthTokenResponse> {
  const redirectUri = buildRedirectUri(input.appUrl, input.provider);

  if (input.provider === 'x') {
    const clientId = input.xClientId?.trim() ?? '';
    if (!clientId) throw new Error('X OAuth is not configured: missing X_OAUTH_CLIENT_ID.');
    if (!input.codeVerifier?.trim()) {
      throw new Error('X OAuth callback is missing PKCE verifier state.');
    }

    const tokenUrl = (input.xTokenUrl?.trim() || 'https://api.x.com/2/oauth2/token').trim();
    const form = new URLSearchParams();
    form.set('grant_type', 'authorization_code');
    form.set('code', input.code);
    form.set('redirect_uri', redirectUri);
    form.set('client_id', clientId);
    form.set('code_verifier', input.codeVerifier.trim());
    if (input.xClientSecret?.trim()) {
      form.set('client_secret', input.xClientSecret.trim());
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`X OAuth token exchange failed (${response.status}): ${rawText}`);
    }
    return parseTokenExchangeResponse(rawText, 'X');
  }

  if (input.provider === 'instagram') {
    const clientId = input.instagramClientId?.trim() ?? '';
    const clientSecret = input.instagramClientSecret?.trim() ?? '';
    if (!clientId || !clientSecret) {
      throw new Error(
        'Instagram OAuth is not configured: missing INSTAGRAM_OAUTH_CLIENT_ID or INSTAGRAM_OAUTH_CLIENT_SECRET.'
      );
    }
    const tokenUrl = (
      input.instagramTokenUrl?.trim() || 'https://api.instagram.com/oauth/access_token'
    ).trim();
    const form = new URLSearchParams();
    form.set('client_id', clientId);
    form.set('client_secret', clientSecret);
    form.set('grant_type', 'authorization_code');
    form.set('redirect_uri', redirectUri);
    form.set('code', input.code);
    const shortResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const shortText = await shortResponse.text();
    if (!shortResponse.ok) {
      throw new Error(`Instagram OAuth token exchange failed (${shortResponse.status}): ${shortText}`);
    }
    const shortToken = parseTokenExchangeResponse(shortText, 'Instagram');
    const graphBase = (
      input.instagramGraphBaseUrl?.trim() || 'https://graph.instagram.com/v25.0'
    ).replace(/\/+$/, '');
    const exchangeUrl = new URL(`${graphBase}/access_token`);
    exchangeUrl.searchParams.set('grant_type', 'ig_exchange_token');
    exchangeUrl.searchParams.set('client_secret', clientSecret);
    exchangeUrl.searchParams.set('access_token', shortToken.accessToken);
    const longResponse = await fetch(exchangeUrl);
    const longText = await longResponse.text();
    if (!longResponse.ok) {
      throw new Error(
        `Instagram long-lived token exchange failed (${longResponse.status}): ${longText}`
      );
    }
    const longToken = parseTokenExchangeResponse(longText, 'Instagram');
    return {
      ...longToken,
      refreshToken: longToken.accessToken,
      scopeList:
        longToken.scopeList.length > 0
          ? longToken.scopeList
          : [
              'instagram_business_basic',
              'instagram_business_content_publish',
              'instagram_business_manage_insights',
            ],
      raw: {
        token_type: longToken.raw['token_type'] ?? 'bearer',
        expires_in: longToken.raw['expires_in'] ?? null,
        user_id: shortToken.raw['user_id'] ?? null,
      },
    };
  }

  const clientId = input.linkedinClientId?.trim() ?? '';
  const clientSecret = input.linkedinClientSecret?.trim() ?? '';
  if (!clientId || !clientSecret) {
    throw new Error(
      'LinkedIn OAuth is not configured: missing LINKEDIN_OAUTH_CLIENT_ID or LINKEDIN_OAUTH_CLIENT_SECRET.'
    );
  }

  const tokenUrl = (input.linkedinTokenUrl?.trim() || 'https://www.linkedin.com/oauth/v2/accessToken').trim();
  const form = new URLSearchParams();
  form.set('grant_type', 'authorization_code');
  form.set('code', input.code);
  form.set('redirect_uri', redirectUri);
  form.set('client_id', clientId);
  form.set('client_secret', clientSecret);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`LinkedIn OAuth token exchange failed (${response.status}): ${rawText}`);
  }

  return parseTokenExchangeResponse(rawText, 'LinkedIn');
}

export async function refreshSocialOAuthToken(
  input: SocialOAuthTokenRefreshInput
): Promise<SocialOAuthTokenResponse> {
  const refreshToken = input.refreshToken.trim();
  if (!refreshToken) {
    throw new Error(`${input.provider} OAuth refresh requires a refresh token.`);
  }

  if (input.provider === 'x') {
    const clientId = input.xClientId?.trim() ?? '';
    if (!clientId) {
      throw new Error('X OAuth refresh is not configured: missing X_OAUTH_CLIENT_ID.');
    }

    const tokenUrl = (input.xTokenUrl?.trim() || 'https://api.x.com/2/oauth2/token').trim();
    const form = new URLSearchParams();
    form.set('grant_type', 'refresh_token');
    form.set('refresh_token', refreshToken);
    form.set('client_id', clientId);
    if (input.xClientSecret?.trim()) {
      form.set('client_secret', input.xClientSecret.trim());
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`X OAuth token refresh failed (${response.status}): ${rawText}`);
    }

    return parseTokenExchangeResponse(rawText, 'X');
  }

  if (input.provider === 'linkedin') {
    const clientId = input.linkedinClientId?.trim() ?? '';
    const clientSecret = input.linkedinClientSecret?.trim() ?? '';
    if (!clientId || !clientSecret) {
      throw new Error(
        'LinkedIn OAuth refresh is not configured: missing LINKEDIN_OAUTH_CLIENT_ID or LINKEDIN_OAUTH_CLIENT_SECRET.'
      );
    }

    const tokenUrl = (input.linkedinTokenUrl?.trim() || 'https://www.linkedin.com/oauth/v2/accessToken').trim();
    const form = new URLSearchParams();
    form.set('grant_type', 'refresh_token');
    form.set('refresh_token', refreshToken);
    form.set('client_id', clientId);
    form.set('client_secret', clientSecret);

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`LinkedIn OAuth token refresh failed (${response.status}): ${rawText}`);
    }

    return parseTokenExchangeResponse(rawText, 'LinkedIn');
  }

  if (input.provider === 'instagram') {
    const graphBase = (
      input.instagramGraphBaseUrl?.trim() || 'https://graph.instagram.com/v25.0'
    ).replace(/\/+$/, '');
    const refreshUrl = new URL(`${graphBase}/refresh_access_token`);
    refreshUrl.searchParams.set('grant_type', 'ig_refresh_token');
    refreshUrl.searchParams.set('access_token', refreshToken);
    const response = await fetch(refreshUrl);
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`Instagram OAuth token refresh failed (${response.status}): ${rawText}`);
    }
    const refreshed = parseTokenExchangeResponse(rawText, 'Instagram');
    return {
      ...refreshed,
      refreshToken: refreshed.accessToken,
      raw: {
        token_type: refreshed.raw['token_type'] ?? 'bearer',
        expires_in: refreshed.raw['expires_in'] ?? null,
      },
    };
  }

  throw new Error(`OAuth refresh is not yet implemented for provider ${input.provider}.`);
}

export async function fetchInstagramOAuthProfile(input: {
  readonly accessToken: string;
  readonly graphBaseUrl?: string;
}): Promise<{ userId: string; username: string | null; accountType: string | null }> {
  const graphBase = (
    input.graphBaseUrl?.trim() || 'https://graph.instagram.com/v25.0'
  ).replace(/\/+$/, '');
  const url = new URL(`${graphBase}/me`);
  url.searchParams.set('fields', 'user_id,username,account_type');
  url.searchParams.set('access_token', input.accessToken);
  const response = await fetch(url);
  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`Instagram profile lookup failed (${response.status}): ${rawText}`);
  }
  const json = JSON.parse(rawText) as Record<string, unknown>;
  const userId = String(json['user_id'] ?? json['id'] ?? '').trim();
  if (!userId) throw new Error('Instagram profile lookup returned no user id.');
  return {
    userId,
    username: typeof json['username'] === 'string' ? json['username'].trim() || null : null,
    accountType:
      typeof json['account_type'] === 'string' ? json['account_type'].trim() || null : null,
  };
}
