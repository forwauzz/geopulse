import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkScanStoreReadiness,
  scanServiceUnavailableResponse,
  SCAN_STORE_RETRY_AFTER_SECONDS,
} from './scan-store-readiness';

function clientReturning(result: unknown): SupabaseClient {
  const limit = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as SupabaseClient;
}

describe('scan store readiness', () => {
  it('accepts a healthy read-only HEAD probe', async () => {
    const client = clientReturning({ error: null });

    await expect(checkScanStoreReadiness(client)).resolves.toEqual({ available: true });
    expect(client.from).toHaveBeenCalledWith('scans');
  });

  it('returns a bounded unavailable result without exposing provider details', async () => {
    const client = clientReturning({
      error: { code: 'PGRST001', message: 'database host and secret detail' },
    });

    await expect(checkScanStoreReadiness(client)).resolves.toEqual({
      available: false,
      reason: 'query_failed',
      errorCode: 'PGRST001',
    });
  });

  it('turns a transport exception into a bounded unavailable result', async () => {
    const limit = vi.fn().mockRejectedValue(new Error('private connection detail'));
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ limit }),
      }),
    } as unknown as SupabaseClient;

    await expect(checkScanStoreReadiness(client)).resolves.toEqual({
      available: false,
      reason: 'request_failed',
      errorCode: null,
    });
  });

  it('returns a non-cacheable 503 with an explicit retry contract', async () => {
    const response = scanServiceUnavailableResponse();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBe(String(SCAN_STORE_RETRY_AFTER_SECONDS));
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'service_unavailable',
        message: 'The free audit is temporarily unavailable. Please try again shortly.',
      },
    });
  });
});
