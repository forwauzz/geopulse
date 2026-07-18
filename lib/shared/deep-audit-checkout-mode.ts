export type DeepAuditCheckoutMode = 'stripe' | 'agency_bypass' | 'startup_bypass' | 'free';

export const DEEP_AUDIT_CHECKOUT_MODES: DeepAuditCheckoutMode[] = [
  'stripe',
  'agency_bypass',
  'startup_bypass',
  'free',
];

export function normalizeDeepAuditCheckoutMode(mode: unknown): DeepAuditCheckoutMode {
  return mode === 'agency_bypass' || mode === 'startup_bypass' || mode === 'free' ? mode : 'stripe';
}

/**
 * OSS de-paywall flag. Default (unset / anything but "true") = full audit is FREE for everyone.
 * "true" = legacy paid mode: public users go through Stripe checkout.
 */
export function isLegacyPaidEnabled(legacyPaidEnabledVar: string | undefined | null): boolean {
  return String(legacyPaidEnabledVar).trim().toLowerCase() === 'true';
}
