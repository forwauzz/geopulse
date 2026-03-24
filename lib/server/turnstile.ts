/**
 * Server-side Cloudflare Turnstile verification.
 */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileVerifyResult =
  | { ok: true }
  | { ok: false; error: string };

export async function verifyTurnstileToken(
  secret: string,
  token: string,
  remoteip?: string | null
): Promise<TurnstileVerifyResult> {
  if (!token?.trim()) {
    return { ok: false, error: 'missing_turnstile_token' };
  }
  if (!secret) {
    return { ok: false, error: 'missing_turnstile_secret' };
  }

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (remoteip) body.set('remoteip', remoteip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    const data = (await res.json()) as {
      success?: boolean;
      'error-codes'?: string[];
    };

    if (data.success === true) return { ok: true };

    const codes = data['error-codes']?.join(',') ?? 'unknown';
    return { ok: false, error: codes };
  } catch {
    return { ok: false, error: 'turnstile_request_failed' };
  }
}
