import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstileToken } from './turnstile';

describe('verifyTurnstileToken', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects missing token before fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await verifyTurnstileToken('secret', '');
    expect(result).toEqual({ ok: false, error: 'missing_turnstile_token' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects missing secret before fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await verifyTurnstileToken('', 'token');
    expect(result).toEqual({ ok: false, error: 'missing_turnstile_secret' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns ok for successful verification', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );

    const result = await verifyTurnstileToken('secret', 'token', '203.0.113.10');
    expect(result).toEqual({ ok: true });
  });

  it('returns joined error codes for failed verification', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate', 'bad-request'] }), {
        status: 200,
      })
    );

    const result = await verifyTurnstileToken('secret', 'token');
    expect(result).toEqual({ ok: false, error: 'timeout-or-duplicate,bad-request' });
  });

  it('returns request_failed on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));

    const result = await verifyTurnstileToken('secret', 'token');
    expect(result).toEqual({ ok: false, error: 'turnstile_request_failed' });
  });
});
