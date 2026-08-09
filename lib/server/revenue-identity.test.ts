import { describe, expect, it } from 'vitest';
import {
  isExcludedRevenueIdentity,
  isExternalPaidCheckout,
  isPaidCheckoutMetadata,
} from './revenue-identity';

describe('revenue identity and checkout truth', () => {
  it('treats GEO-Pulse, Teche, Lifter, examples, and the confirmed Alie workspace as internal', () => {
    expect(isExcludedRevenueIdentity({ email: 'uzzielt@techehealthservices.com' })).toBe(true);
    expect(isExcludedRevenueIdentity({ email: 'jack@lifter.ca' })).toBe(true);
    expect(isExcludedRevenueIdentity({ email: 'founder@gmail.com', domain: 'https://alie.app' })).toBe(true);
    expect(isExcludedRevenueIdentity({ domain: 'https://getgeopulse.com/results/test' })).toBe(true);
    expect(isExcludedRevenueIdentity({ email: 'buyer+test@northstarmsp.ca' })).toBe(true);
    expect(isExcludedRevenueIdentity({ domain: 'https://northstarmsp.ca' })).toBe(false);
  });

  it('does not treat free report completion as paid checkout intent', () => {
    expect(isPaidCheckoutMetadata({ mode: 'free' })).toBe(false);
    expect(isExternalPaidCheckout({
      domain: 'northstarmsp.ca',
      metadata: { mode: 'free' },
    })).toBe(false);
  });

  it('accepts external subscription and one-time Stripe checkout starts only', () => {
    expect(isExternalPaidCheckout({
      email: 'owner@northstarmsp.ca',
      domain: 'northstarmsp.ca',
      metadata: {
        commerce_kind: 'paid_checkout',
        checkout_mode: 'subscription',
        stripe_session_id: 'cs_live_external',
      },
    })).toBe(true);
    expect(isExternalPaidCheckout({
      email: 'founder@gmail.com',
      domain: 'alie.app',
      metadata: { kind: 'monitor', stripe_session_id: 'cs_test_founder' },
    })).toBe(false);
    expect(isPaidCheckoutMetadata({ stripe_session_id: 'cs_live_legacy' })).toBe(true);
  });
});
