import { describe, expect, it } from 'vitest';
import { resolveDeepAuditCheckoutRedirect } from './deep-audit-checkout-redirect';

describe('resolveDeepAuditCheckoutRedirect', () => {
  it('keeps same-origin targets in-app', () => {
    expect(
      resolveDeepAuditCheckoutRedirect(
        'https://getgeopulse.com/results/scan-1/report',
        'https://getgeopulse.com'
      )
    ).toEqual({ kind: 'replace', href: '/results/scan-1/report' });
  });

  it('falls back to a full redirect for external targets', () => {
    expect(
      resolveDeepAuditCheckoutRedirect('https://stripe.test/checkout', 'https://getgeopulse.com')
    ).toEqual({ kind: 'assign', href: 'https://stripe.test/checkout' });
  });
});
