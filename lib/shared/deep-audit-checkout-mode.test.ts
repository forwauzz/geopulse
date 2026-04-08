import { describe, expect, it } from 'vitest';
import {
  DEEP_AUDIT_CHECKOUT_MODES,
  normalizeDeepAuditCheckoutMode,
} from './deep-audit-checkout-mode';

describe('deep-audit checkout mode contract', () => {
  it('exposes the supported runtime modes', () => {
    expect(DEEP_AUDIT_CHECKOUT_MODES).toEqual(['stripe', 'agency_bypass', 'startup_bypass']);
  });

  it('normalizes unknown values to stripe', () => {
    expect(normalizeDeepAuditCheckoutMode(undefined)).toBe('stripe');
    expect(normalizeDeepAuditCheckoutMode('other')).toBe('stripe');
  });

  it('preserves bypass modes', () => {
    expect(normalizeDeepAuditCheckoutMode('agency_bypass')).toBe('agency_bypass');
    expect(normalizeDeepAuditCheckoutMode('startup_bypass')).toBe('startup_bypass');
  });
});
