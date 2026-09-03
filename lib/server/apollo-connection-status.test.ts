import { describe, expect, it } from 'vitest';
import { normalizeApolloFailureCode, resolveApolloConnectionStatus } from './apollo-connection-status';

describe('Apollo connection status', () => {
  it('does not treat secret presence as verified connectivity', () => {
    expect(resolveApolloConnectionStatus({ keyConfigured: true, searched: false })).toEqual({
      label: 'Apollo key configured',
      tone: 'warning',
    });
  });

  it('surfaces authentication failure even when the key is configured', () => {
    expect(resolveApolloConnectionStatus({ keyConfigured: true, searched: false, error: 'apollo_http_401' })).toEqual({
      label: 'Apollo authentication failed',
      tone: 'error',
    });
  });

  it('marks connectivity verified only after a successful search', () => {
    expect(resolveApolloConnectionStatus({ keyConfigured: true, searched: true })).toEqual({
      label: 'Apollo verified',
      tone: 'healthy',
    });
  });

  it('reduces arbitrary provider messages to a non-sensitive failure code', () => {
    expect(normalizeApolloFailureCode('apollo http 401')).toBe('apollo_http_401');
    expect(normalizeApolloFailureCode('unexpected upstream body')).toBe('apollo_request_failed');
  });
});
