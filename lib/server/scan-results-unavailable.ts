export const SCAN_RESULTS_RETRY_AFTER_SECONDS = 300;

export function scanResultsUnavailableResponse(): Response {
  return Response.json(
    {
      error: {
        code: 'service_unavailable',
        message: 'Scan results are temporarily unavailable. Please try again shortly.',
      },
    },
    {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': String(SCAN_RESULTS_RETRY_AFTER_SECONDS),
      },
    }
  );
}
