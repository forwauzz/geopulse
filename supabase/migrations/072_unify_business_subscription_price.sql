-- Make the customer-facing Business bundle use the same canonical $39 CAD
-- monthly monitoring price already sold by the product. This removes the
-- legacy $19.75 Startup Dev price from the self-serve journey.
UPDATE public.service_bundles
SET
  stripe_price_id = 'price_1Tw3kSKknNpProh1VRN4mnX9',
  monthly_price_cents = 3900,
  updated_at = NOW()
WHERE bundle_key = 'startup_dev';
