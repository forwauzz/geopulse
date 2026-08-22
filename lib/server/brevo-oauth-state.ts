const STATE_VERSION = 'bo1';

export type BrevoOAuthState = {
  readonly userId: string;
  readonly agencyAccountId: string;
  readonly issuedAt: number;
  readonly nonce: string;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 24) throw new Error('BREVO_OAUTH_CLIENT_SECRET is too short for state signing');
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  );
}

export async function signBrevoOAuthState(payload: BrevoOAuthState, secret: string): Promise<string> {
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const input = `${STATE_VERSION}.${encoded}`;
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), new TextEncoder().encode(input));
  return `${input}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyBrevoOAuthState(
  state: string,
  secret: string,
  nowMs = Date.now(),
  maxAgeMs = 10 * 60 * 1000,
): Promise<BrevoOAuthState | null> {
  try {
    const [version, encoded, signature] = state.split('.');
    if (version !== STATE_VERSION || !encoded || !signature) return null;
    const input = `${version}.${encoded}`;
    const valid = await crypto.subtle.verify(
      'HMAC', await signingKey(secret), base64UrlToBytes(signature), new TextEncoder().encode(input),
    );
    if (!valid) return null;
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as BrevoOAuthState;
    if (!parsed.userId || !parsed.agencyAccountId || !parsed.nonce || !Number.isFinite(parsed.issuedAt)) return null;
    if (parsed.issuedAt > nowMs + 60_000 || nowMs - parsed.issuedAt > maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function hashBrevoOAuthState(state: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state));
  return `sha256:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')}`;
}
