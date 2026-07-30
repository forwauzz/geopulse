import type { SocialOAuthProvider } from './distribution-social-oauth';

export type DistributionOAuthCallbackStage =
  | 'token_exchange'
  | 'scope_validation'
  | 'identity_verification'
  | 'token_encryption'
  | 'token_persistence'
  | 'account_persistence';

export function buildDistributionOAuthFailureOutcome(
  stage: DistributionOAuthCallbackStage
): string {
  return `${stage}_failed`;
}

export function buildDistributionOAuthFailureLog(
  provider: SocialOAuthProvider,
  stage: DistributionOAuthCallbackStage
) {
  return {
    event: 'distribution_oauth_callback_failed',
    provider,
    stage,
  } as const;
}
