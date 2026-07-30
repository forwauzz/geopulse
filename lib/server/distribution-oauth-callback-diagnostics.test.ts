import { describe, expect, it } from 'vitest';
import {
  buildDistributionOAuthFailureLog,
  buildDistributionOAuthFailureOutcome,
} from './distribution-oauth-callback-diagnostics';

describe('distribution OAuth callback diagnostics', () => {
  it('builds a stable stage-specific redirect outcome', () => {
    expect(buildDistributionOAuthFailureOutcome('token_exchange')).toBe(
      'token_exchange_failed'
    );
    expect(buildDistributionOAuthFailureOutcome('identity_verification')).toBe(
      'identity_verification_failed'
    );
    expect(
      buildDistributionOAuthFailureOutcome(
        'identity_verification',
        'provider_http_402'
      )
    ).toBe('identity_verification_provider_http_402_failed');
  });

  it('builds a structured log without credential or token fields', () => {
    expect(buildDistributionOAuthFailureLog('x', 'scope_validation')).toEqual({
      event: 'distribution_oauth_callback_failed',
      provider: 'x',
      stage: 'scope_validation',
    });
    expect(
      buildDistributionOAuthFailureLog(
        'x',
        'identity_verification',
        'provider_http_402'
      )
    ).toEqual({
      event: 'distribution_oauth_callback_failed',
      provider: 'x',
      stage: 'identity_verification',
      reason: 'provider_http_402',
    });
  });
});
