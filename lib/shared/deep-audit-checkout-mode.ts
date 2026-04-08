export type DeepAuditCheckoutMode = 'stripe' | 'agency_bypass' | 'startup_bypass';

export const DEEP_AUDIT_CHECKOUT_MODES: DeepAuditCheckoutMode[] = [
  'stripe',
  'agency_bypass',
  'startup_bypass',
];

export function normalizeDeepAuditCheckoutMode(mode: unknown): DeepAuditCheckoutMode {
  return mode === 'agency_bypass' || mode === 'startup_bypass' ? mode : 'stripe';
}
