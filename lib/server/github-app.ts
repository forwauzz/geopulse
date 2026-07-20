/**
 * GitHub App auth + the minimal REST surface needed to open a PR.
 *
 * Runs inside the Cloudflare Worker, so the App JWT is signed with WebCrypto (RS256) — no Node
 * crypto, no JWT library. Flow: App JWT → installation access token → REST calls scoped to that
 * installation (i.e. only repos the customer explicitly granted).
 *
 * Private key: PKCS#8 ("BEGIN PRIVATE KEY") is preferred; GitHub hands out PKCS#1
 * ("BEGIN RSA PRIVATE KEY"), which we wrap into PKCS#8 so either works.
 */

const GH_API = 'https://api.github.com';
const UA = 'GEO-Pulse-Fix-Agent';

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlFromString(s: string): string {
  return b64urlFromBytes(new TextEncoder().encode(s));
}

function derFromPem(pem: string): { der: Uint8Array; pkcs1: boolean } {
  const pkcs1 = /BEGIN RSA PRIVATE KEY/.test(pem);
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) der[i] = bin.charCodeAt(i);
  return { der, pkcs1 };
}

/** Wrap a PKCS#1 RSAPrivateKey in the PKCS#8 PrivateKeyInfo envelope WebCrypto requires. */
export function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  // PrivateKeyInfo ::= SEQUENCE { version INTEGER 0, algorithm rsaEncryption NULL, privateKey OCTET STRING }
  const rsaOid = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const version = [0x02, 0x01, 0x00];

  const derLen = (n: number): number[] => {
    if (n < 0x80) return [n];
    const bytes: number[] = [];
    let v = n;
    while (v > 0) {
      bytes.unshift(v & 0xff);
      v >>= 8;
    }
    return [0x80 | bytes.length, ...bytes];
  };

  const octet = [0x04, ...derLen(pkcs1.length), ...pkcs1];
  const inner = [...version, ...rsaOid, ...octet];
  const full = [0x30, ...derLen(inner.length), ...inner];
  return new Uint8Array(full);
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const { der, pkcs1 } = derFromPem(pem);
  const pkcs8 = pkcs1 ? pkcs1ToPkcs8(der) : der;
  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8 as unknown as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/** Short-lived App JWT (max 10 min per GitHub; we use 9). */
export async function createAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlFromString(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64urlFromString(
    JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId })
  );
  const signingInput = `${header}.${payload}`;
  const key = await importPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput) as unknown as ArrayBuffer
  );
  return `${signingInput}.${b64urlFromBytes(new Uint8Array(sig))}`;
}

/** Exchange the App JWT for an installation access token (scoped to that install's repos). */
export async function getInstallationToken(
  appId: string,
  privateKeyPem: string,
  installationId: number
): Promise<{ ok: true; token: string } | { ok: false; reason: string }> {
  try {
    const jwt = await createAppJwt(appId, privateKeyPem);
    const res = await fetch(`${GH_API}/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': UA,
      },
    });
    if (!res.ok) {
      return { ok: false, reason: `installation_token_http_${String(res.status)}` };
    }
    const data = (await res.json()) as { token?: string };
    return data.token ? { ok: true, token: data.token } : { ok: false, reason: 'installation_token_missing' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message.slice(0, 160) : 'jwt_error' };
  }
}

// ── Minimal REST surface for "open a PR" ──────────────────────────────────────

async function gh<T>(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<{ ok: true; data: T } | { ok: false; reason: string }> {
  try {
    const res = await fetch(`${GH_API}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': UA,
      },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    });
    if (!res.ok) return { ok: false, reason: `github_http_${String(res.status)}` };
    return { ok: true, data: (await res.json()) as T };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message.slice(0, 160) : 'github_error' };
  }
}

export async function getDefaultBranch(
  token: string,
  owner: string,
  repo: string
): Promise<{ ok: true; branch: string; sha: string } | { ok: false; reason: string }> {
  const info = await gh<{ default_branch?: string }>(token, `/repos/${owner}/${repo}`);
  if (!info.ok) return info;
  const branch = info.data.default_branch ?? 'main';
  const ref = await gh<{ object?: { sha?: string } }>(
    token,
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`
  );
  if (!ref.ok) return ref;
  const sha = ref.data.object?.sha;
  return sha ? { ok: true, branch, sha } : { ok: false, reason: 'default_branch_sha_missing' };
}

export async function createBranch(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  fromSha: string
): Promise<{ ok: boolean; reason?: string }> {
  const res = await gh(token, `/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${branch}`, sha: fromSha },
  });
  return res.ok ? { ok: true } : { ok: false, reason: res.reason };
}

/** Create or update a file on a branch. Returns ok even if content is unchanged. */
export async function putFile(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  content: string,
  message: string
): Promise<{ ok: boolean; reason?: string }> {
  // Look up an existing blob sha so we can update rather than fail.
  const existing = await gh<{ sha?: string }>(
    token,
    `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`
  );
  const sha = existing.ok ? existing.data.sha : undefined;
  const encoded = b64FromUtf8(content);
  const res = await gh(token, `/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    body: { message, content: encoded, branch, ...(sha ? { sha } : {}) },
  });
  return res.ok ? { ok: true } : { ok: false, reason: res.reason };
}

function b64FromUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function createPullRequest(
  token: string,
  owner: string,
  repo: string,
  args: { title: string; head: string; base: string; body: string }
): Promise<{ ok: true; url: string; number: number } | { ok: false; reason: string }> {
  const res = await gh<{ html_url?: string; number?: number }>(
    token,
    `/repos/${owner}/${repo}/pulls`,
    { method: 'POST', body: args }
  );
  if (!res.ok) return res;
  return res.data.html_url && res.data.number
    ? { ok: true, url: res.data.html_url, number: res.data.number }
    : { ok: false, reason: 'pull_request_response_incomplete' };
}
