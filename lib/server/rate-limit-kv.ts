/**
 * Rate limits using KV (10 req/min per IP, 20 scans/day per email).
 */
export type RateLimitResult = { ok: true } | { ok: false; code: 'ip' | 'email'; retryAfterSec?: number };

const IP_WINDOW_SEC = 60;
const IP_MAX = 10;
const EMAIL_WINDOW_SEC = 86_400;
const EMAIL_MAX = 20;

function minuteBucket(): string {
  return String(Math.floor(Date.now() / 60_000));
}

function dayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function checkScanRateLimit(
  kv: KVNamespace | undefined,
  ip: string
): Promise<RateLimitResult> {
  if (!kv) return { ok: true };
  const key = `rl:scan:ip:${ip}:${minuteBucket()}`;
  const raw = await kv.get(key);
  const n = raw ? Number.parseInt(raw, 10) : 0;
  if (Number.isFinite(n) && n >= IP_MAX) {
    return { ok: false, code: 'ip', retryAfterSec: IP_WINDOW_SEC };
  }
  await kv.put(key, String(n + 1), { expirationTtl: IP_WINDOW_SEC * 2 });
  return { ok: true };
}

export async function checkEmailLeadRateLimit(
  kv: KVNamespace | undefined,
  emailKey: string
): Promise<RateLimitResult> {
  if (!kv) return { ok: true };
  const key = `rl:lead:email:${emailKey}:${dayBucket()}`;
  const raw = await kv.get(key);
  const n = raw ? Number.parseInt(raw, 10) : 0;
  if (Number.isFinite(n) && n >= EMAIL_MAX) {
    return { ok: false, code: 'email', retryAfterSec: EMAIL_WINDOW_SEC };
  }
  await kv.put(key, String(n + 1), { expirationTtl: EMAIL_WINDOW_SEC * 2 });
  return { ok: true };
}

/** Normalize email for rate-key (lowercase, trim). */
export function emailRateKey(email: string): string {
  return email.trim().toLowerCase();
}

const CHECKOUT_WINDOW_SEC = 3600;
const CHECKOUT_MAX_PER_IP = 5;

function hourBucket(): string {
  return String(Math.floor(Date.now() / 3_600_000));
}

/** Stripe checkout: 5 attempts per IP per hour (security rules). */
export async function checkCheckoutRateLimit(
  kv: KVNamespace | undefined,
  ip: string
): Promise<RateLimitResult> {
  if (!kv) return { ok: true };
  const key = `rl:checkout:ip:${ip}:${hourBucket()}`;
  const raw = await kv.get(key);
  const n = raw ? Number.parseInt(raw, 10) : 0;
  if (Number.isFinite(n) && n >= CHECKOUT_MAX_PER_IP) {
    return { ok: false, code: 'ip', retryAfterSec: CHECKOUT_WINDOW_SEC };
  }
  await kv.put(key, String(n + 1), { expirationTtl: CHECKOUT_WINDOW_SEC * 2 });
  return { ok: true };
}
