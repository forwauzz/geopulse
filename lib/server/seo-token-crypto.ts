const VERSION = 'v1';

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function importEncryptionKey(base64UrlKey: string): Promise<CryptoKey> {
  const bytes = base64UrlToBytes(base64UrlKey.trim());
  if (bytes.byteLength !== 32) {
    throw new Error('SEO_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSeoToken(plaintext: string, base64UrlKey: string): Promise<string> {
  if (!plaintext) return '';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importEncryptionKey(base64UrlKey);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${VERSION}.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptSeoToken(payload: string, base64UrlKey: string): Promise<string> {
  if (!payload) return '';
  const [version, ivValue, ciphertextValue] = payload.split('.');
  if (version !== VERSION || !ivValue || !ciphertextValue) {
    throw new Error('Unsupported SEO token envelope');
  }
  const key = await importEncryptionKey(base64UrlKey);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(ivValue) },
    key,
    base64UrlToBytes(ciphertextValue)
  );
  return new TextDecoder().decode(plaintext);
}

type OAuthStatePayload = {
  readonly userId: string;
  readonly returnTo: string;
  readonly issuedAt: number;
  readonly nonce: string;
};

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signSeoOAuthState(
  payload: OAuthStatePayload,
  signingSecret: string
): Promise<string> {
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await importSigningKey(signingSecret),
    new TextEncoder().encode(encoded)
  );
  return `${encoded}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifySeoOAuthState(
  state: string,
  signingSecret: string,
  nowMs = Date.now(),
  maxAgeMs = 10 * 60 * 1000
): Promise<OAuthStatePayload | null> {
  try {
    const [encoded, signature] = state.split('.');
    if (!encoded || !signature) return null;
    const valid = await crypto.subtle.verify(
      'HMAC',
      await importSigningKey(signingSecret),
      base64UrlToBytes(signature),
      new TextEncoder().encode(encoded)
    );
    if (!valid) return null;
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as OAuthStatePayload;
    if (
      !parsed.userId ||
      !parsed.nonce ||
      !Number.isFinite(parsed.issuedAt) ||
      parsed.issuedAt > nowMs + 60_000 ||
      nowMs - parsed.issuedAt > maxAgeMs ||
      !parsed.returnTo.startsWith('/')
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
