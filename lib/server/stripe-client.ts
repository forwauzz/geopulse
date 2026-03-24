import Stripe from 'stripe';

/** Stripe SDK default uses Node http/https; workerd needs Fetch. Safe on Node 18+ too. */
export function createStripeClient(apiKey: string): Stripe {
  return new Stripe(apiKey, {
    typescript: true,
    httpClient: Stripe.createFetchHttpClient(),
  });
}
