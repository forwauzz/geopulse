-- SD-012
-- Canonical Stripe mapping for service + bundle billing control.

CREATE TABLE public.service_billing_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID NOT NULL REFERENCES public.service_catalog(id) ON DELETE CASCADE,
  bundle_id UUID NOT NULL REFERENCES public.service_bundles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'stripe',
  billing_mode public.service_access_mode NOT NULL DEFAULT 'paid',
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_billing_mappings_provider_check CHECK (provider IN ('stripe')),
  CONSTRAINT service_billing_mappings_billing_mode_check CHECK (billing_mode IN ('free', 'paid', 'trial', 'off')),
  CONSTRAINT service_billing_mappings_unique UNIQUE (service_id, bundle_id)
);

CREATE INDEX service_billing_mappings_service_bundle_idx
  ON public.service_billing_mappings (service_id, bundle_id, is_active);

CREATE INDEX service_billing_mappings_provider_created_at_idx
  ON public.service_billing_mappings (provider, created_at DESC);

CREATE TRIGGER service_billing_mappings_updated_at
  BEFORE UPDATE ON public.service_billing_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.service_billing_mappings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.service_billing_mappings IS 'Central Stripe billing map for service/bundle runtime guard checks.';
COMMENT ON COLUMN public.service_billing_mappings.billing_mode IS 'Billing intent for mapped service in this bundle. Use free/trial/paid/off for runtime checks.';
