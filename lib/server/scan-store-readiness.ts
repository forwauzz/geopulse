import type { SupabaseClient } from '@supabase/supabase-js';

export const SCAN_STORE_RETRY_AFTER_SECONDS = 300;

export type ScanStoreReadiness =
  | { available: true }
  | {
      available: false;
      reason: 'query_failed' | 'request_failed';
      errorCode: string | null;
    };

/**
 * Fail before crawl/provider work when the scan store cannot accept a result.
 * The HEAD probe reads no customer rows and keeps provider spend out of a
 * request that cannot complete while the production data plane is unavailable.
 */
export async function checkScanStoreReadiness(
  supabase: SupabaseClient
): Promise<ScanStoreReadiness> {
  try {
    const { error } = await supabase
      .from('scans')
      .select('id', { head: true })
      .limit(1);

    if (error) {
      return {
        available: false,
        reason: 'query_failed',
        errorCode: typeof error.code === 'string' ? error.code : null,
      };
    }

    return { available: true };
  } catch {
    return {
      available: false,
      reason: 'request_failed',
      errorCode: null,
    };
  }
}

export function scanServiceUnavailableResponse(): Response {
  return Response.json(
    {
      error: {
        code: 'service_unavailable',
        message: 'The free audit is temporarily unavailable. Please try again shortly.',
      },
    },
    {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': String(SCAN_STORE_RETRY_AFTER_SECONDS),
      },
    }
  );
}
