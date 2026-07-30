import type {
  SocialOAuthFailureReason,
  SocialOAuthProvider,
} from './distribution-social-oauth';

export type DistributionOAuthCallbackStage =
  | 'token_exchange'
  | 'scope_validation'
  | 'identity_verification'
  | 'token_encryption'
  | 'token_persistence'
  | 'account_persistence';

export function buildDistributionOAuthFailureOutcome(
  stage: DistributionOAuthCallbackStage,
  reason?: SocialOAuthFailureReason | null
): string {
  return reason ? `${stage}_${reason}_failed` : `${stage}_failed`;
}

export function buildDistributionOAuthFailureLog(
  provider: SocialOAuthProvider,
  stage: DistributionOAuthCallbackStage,
  reason?: SocialOAuthFailureReason | null
) {
  return {
    event: 'distribution_oauth_callback_failed',
    provider,
    stage,
    ...(reason ? { reason } : {}),
  } as const;
}
