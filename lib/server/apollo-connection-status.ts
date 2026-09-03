export type ApolloConnectionStatus = {
  readonly label: 'Apollo key required' | 'Apollo key configured' | 'Apollo verified' | 'Apollo authentication failed' | 'Apollo needs attention';
  readonly tone: 'healthy' | 'warning' | 'error';
};

export function normalizeApolloFailureCode(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? '';
  const http = normalized.match(/^apollo[_ -]http[_ -](\d{3})$/);
  if (http) return `apollo_http_${http[1]}`;
  if (normalized === 'apollo_api_key_missing') return normalized;
  return normalized ? 'apollo_request_failed' : '';
}

export function resolveApolloConnectionStatus(args: {
  readonly keyConfigured: boolean;
  readonly searched: boolean;
  readonly error?: string | null;
}): ApolloConnectionStatus {
  const error = normalizeApolloFailureCode(args.error);
  if (error === 'apollo_http_401') return { label: 'Apollo authentication failed', tone: 'error' };
  if (error) return { label: 'Apollo needs attention', tone: 'error' };
  if (args.searched) return { label: 'Apollo verified', tone: 'healthy' };
  if (args.keyConfigured) return { label: 'Apollo key configured', tone: 'warning' };
  return { label: 'Apollo key required', tone: 'warning' };
}
