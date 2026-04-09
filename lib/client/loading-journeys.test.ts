import { describe, expect, it } from 'vitest';
import { pricingCheckoutWaitJourney } from './loading-journeys';

describe('pricingCheckoutWaitJourney', () => {
  it('keeps the pricing checkout wait state to one stable step', () => {
    expect(pricingCheckoutWaitJourney.title).toBe('Preparing secure checkout');
    expect(pricingCheckoutWaitJourney.steps).toEqual(['Opening secure payment']);
  });
});
