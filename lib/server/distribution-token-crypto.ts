const VERSION = 'dt1';

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
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function importEncryptionKey(base64UrlKey: string): Promise<CryptoKey> {
  const bytes = base64UrlToBytes(base64UrlKey.trim());
  if (bytes.byteLength !== 32) {
    throw new Error('DISTRIBUTION_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export function isEncryptedDistributionToken(payload: string): boolean {
  return payload.startsWith(`${VERSION}.`);
}

export async function encryptDistributionToken(
  plaintext: string,
  base64UrlKey: string
): Promise<string> {
  if (!plaintext) return '';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importEncryptionKey(base64UrlKey);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${VERSION}.${bytesToBase64Url(iv)}.${bytesToBase64Url(
    new Uint8Array(ciphertext)
  )}`;
}

export async function decryptDistributionToken(
  payload: string,
  base64UrlKey?: string
): Promise<string> {
  if (!payload) return '';

  // Bounded migration compatibility for token rows created before application-layer
  // encryption shipped. Every new write uses an encrypted envelope.
  if (!isEncryptedDistributionToken(payload)) return payload;

  if (!base64UrlKey?.trim()) {
    throw new Error('DISTRIBUTION_TOKEN_ENCRYPTION_KEY is required to decrypt provider tokens');
  }
  const [version, ivValue, ciphertextValue] = payload.split('.');
  if (version !== VERSION || !ivValue || !ciphertextValue) {
    throw new Error('Unsupported distribution token envelope');
  }
  const key = await importEncryptionKey(base64UrlKey);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(ivValue) },
    key,
    base64UrlToBytes(ciphertextValue)
  );
  return new TextDecoder().decode(plaintext);
}
