import { describe, expect, it } from 'vitest';
import { createAppJwt, pkcs1ToPkcs8 } from './github-app';

/**
 * Proves the GitHub App auth path works WITHOUT any real credentials: we generate a throwaway
 * RSA keypair, run it through the same PEM → WebCrypto → RS256 code the Worker uses, and verify
 * the resulting JWT against the public key.
 *
 * The PKCS#1 → PKCS#8 wrapper is the fiddly bit (GitHub hands out PKCS#1; WebCrypto needs
 * PKCS#8), so it gets its own equivalence check.
 */

function toPem(der: ArrayBuffer | Uint8Array, label: string): string {
  const bytes = der instanceof Uint8Array ? der : new Uint8Array(der);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/(.{64})/g, '$1\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Minimal ASN.1 peek: pull the PKCS#1 body out of a PKCS#8 PrivateKeyInfo (test-only). */
function extractPkcs1FromPkcs8(pkcs8: Uint8Array): Uint8Array {
  let i = 0;
  const readLen = (): number => {
    const first = pkcs8[i++]!;
    if (first < 0x80) return first;
    const n = first & 0x7f;
    let len = 0;
    for (let k = 0; k < n; k += 1) len = (len << 8) | pkcs8[i++]!;
    return len;
  };
  // NB: `i += readLen()` would be wrong — JS reads `i` before readLen() advances it.
  const skip = (): void => {
    const len = readLen();
    i += len;
  };
  if (pkcs8[i++] !== 0x30) throw new Error('expected SEQUENCE');
  readLen();
  if (pkcs8[i++] !== 0x02) throw new Error('expected version INTEGER');
  skip();
  if (pkcs8[i++] !== 0x30) throw new Error('expected AlgorithmIdentifier');
  skip();
  if (pkcs8[i++] !== 0x04) throw new Error('expected OCTET STRING');
  const len = readLen();
  return pkcs8.slice(i, i + len);
}

async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  ) as Promise<CryptoKeyPair>;
}

describe('GitHub App auth', () => {
  it('signs a verifiable RS256 App JWT from a PKCS#8 key', async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey);
    const jwt = await createAppJwt('123456', toPem(pkcs8, 'PRIVATE KEY'));

    const [header, payload, sig] = jwt.split('.');
    expect(header && payload && sig).toBeTruthy();

    // The signature must verify against the matching public key.
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      b64urlToBytes(sig!) as unknown as ArrayBuffer,
      new TextEncoder().encode(`${header}.${payload}`) as unknown as ArrayBuffer
    );
    expect(ok).toBe(true);

    // GitHub requires iss = App ID and a short window.
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload!))) as {
      iss: string;
      iat: number;
      exp: number;
    };
    expect(claims.iss).toBe('123456');
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(10 * 60);
  });

  it('wraps a PKCS#1 key into byte-identical PKCS#8 (the format GitHub hands out)', async () => {
    const { privateKey } = await generateKeyPair();
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey));
    const pkcs1 = extractPkcs1FromPkcs8(pkcs8);

    expect(Array.from(pkcs1ToPkcs8(pkcs1))).toEqual(Array.from(pkcs8));
  });

  it('accepts a PKCS#1 PEM end-to-end', async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey));
    const pkcs1 = extractPkcs1FromPkcs8(pkcs8);

    const jwt = await createAppJwt('999', toPem(pkcs1, 'RSA PRIVATE KEY'));
    const [header, payload, sig] = jwt.split('.');
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      b64urlToBytes(sig!) as unknown as ArrayBuffer,
      new TextEncoder().encode(`${header}.${payload}`) as unknown as ArrayBuffer
    );
    expect(ok).toBe(true);
  });
});
