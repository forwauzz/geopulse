const TEMPORARY_UNAVAILABLE_CODES = new Set([
  'db_error',
  'server_misconfigured',
  'service_unavailable',
]);

export function messageFromScanError(data: unknown): string {
  if (!data || typeof data !== 'object' || !('error' in data)) {
    return 'The scan could not be completed. Please try again shortly.';
  }

  const err = (data as { error?: unknown }).error;
  if (!err || typeof err !== 'object') {
    return 'The scan could not be completed. Please try again shortly.';
  }

  const code =
    'code' in err && typeof (err as { code?: string }).code === 'string'
      ? (err as { code: string }).code
      : '';

  if (TEMPORARY_UNAVAILABLE_CODES.has(code)) {
    return 'The free audit is temporarily unavailable. Please try again shortly.';
  }

  const raw = (err as { message?: unknown }).message;
  const detail = typeof raw === 'string' ? raw : '';
  if (!detail) return 'The scan could not be completed. Please try again shortly.';

  return code ? `${code}: ${detail}` : detail;
}
