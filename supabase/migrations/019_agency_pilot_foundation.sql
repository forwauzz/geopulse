-- AP-001
-- Agency pilot foundation for multi-client dashboards, entitlements, and model-policy control.
-- This is the schema/control-plane base for the first `lifter` pilot and future agency-linked benchmark-aware usage.

CREATE TABLE public.agency_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_key TEXT NOT NULL,
  name TEXT NOT NULL,
  website_domain TEXT,
  canonical_domain TEXT,
  status TEXT NOT NULL DEFAULT 'pilot',
  billing_mode TEXT NOT NULL DEFAULT 'pilot_exempt',
  benchmark_vertical TEXT,
  benchmark_subvertical TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agency_accounts_account_key_unique UNIQUE (account_key),
  CONSTRAINT agency_accounts_canonical_domain_unique UNIQUE (canonical_domain),
  CONSTRAINT agency_accounts_status_check CHECK (
    status IN ('pilot', 'active', 'paused', 'disabled')
  ),
  CONSTRAINT agency_accounts_billing_mode_check CHECK (
    billing_mode IN ('public_checkout', 'invoice', 'pilot_exempt')
  )
);

CREATE TABLE public.agency_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_account_id UUID NOT NULL REFERENCES public.agency_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agency_users_account_user_unique UNIQUE (agency_account_id, user_id),
  CONSTRAINT agency_users_role_check CHECK (
    role IN ('owner', 'manager', 'member', 'viewer')
  ),
  CONSTRAINT agency_users_status_check CHECK (
    status IN ('invited', 'active', 'suspended')
  )
);

CREATE TABLE public.agency_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_account_id UUID NOT NULL REFERENCES public.agency_accounts(id) ON DELETE CASCADE,
  client_key TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT,
  website_domain TEXT,
  canonical_domain TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  vertical TEXT,
  subvertical TEXT,
  icp_tag TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agency_clients_account_client_key_unique UNIQUE (agency_account_id, client_key),
  CONSTRAINT agency_clients_canonical_domain_unique UNIQUE (canonical_domain),
  CONSTRAINT agency_clients_status_check CHECK (
    status IN ('active', 'paused', 'archived')
  )
);

CREATE TABLE public.agency_client_domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_client_id UUID NOT NULL REFERENCES public.agency_clients(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  canonical_domain TEXT NOT NULL,
  site_url TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agency_client_domains_canonical_domain_unique UNIQUE (canonical_domain)
);

CREATE TABLE public.agency_feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_account_id UUID NOT NULL REFERENCES public.agency_accounts(id) ON DELETE CASCADE,
  agency_client_id UUID REFERENCES public.agency_clients(id) ON DELETE CASCADE,
  flag_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agency_feature_flags_scope_check CHECK (
    agency_client_id IS NULL OR agency_account_id IS NOT NULL
  )
);

CREATE TABLE public.agency_model_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_account_id UUID NOT NULL REFERENCES public.agency_accounts(id) ON DELETE CASCADE,
  agency_client_id UUID REFERENCES public.agency_clients(id) ON DELETE CASCADE,
  product_surface TEXT NOT NULL DEFAULT 'deep_audit',
  provider_name TEXT NOT NULL,
  model_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agency_model_policies_scope_check CHECK (
    agency_client_id IS NULL OR agency_account_id IS NOT NULL
  ),
  CONSTRAINT agency_model_policies_surface_check CHECK (
    product_surface IN ('deep_audit', 'free_scan', 'benchmark', 'report_rewrite')
  ),
  CONSTRAINT agency_model_policies_provider_check CHECK (
    provider_name IN ('gemini', 'openai', 'anthropic', 'custom')
  )
);

CREATE UNIQUE INDEX agency_client_domains_primary_idx
  ON public.agency_client_domains (agency_client_id)
  WHERE is_primary = true;

CREATE UNIQUE INDEX agency_feature_flags_account_scope_unique_idx
  ON public.agency_feature_flags (agency_account_id, flag_key)
  WHERE agency_client_id IS NULL;

CREATE UNIQUE INDEX agency_feature_flags_client_scope_unique_idx
  ON public.agency_feature_flags (agency_client_id, flag_key)
  WHERE agency_client_id IS NOT NULL;

CREATE UNIQUE INDEX agency_model_policies_account_scope_unique_idx
  ON public.agency_model_policies (agency_account_id, product_surface)
  WHERE agency_client_id IS NULL;

CREATE UNIQUE INDEX agency_model_policies_client_scope_unique_idx
  ON public.agency_model_policies (agency_client_id, product_surface)
  WHERE agency_client_id IS NOT NULL;

CREATE INDEX agency_accounts_status_created_at_idx
  ON public.agency_accounts (status, created_at DESC);

CREATE INDEX agency_users_user_id_status_idx
  ON public.agency_users (user_id, status, created_at DESC);

CREATE INDEX agency_clients_account_status_created_at_idx
  ON public.agency_clients (agency_account_id, status, created_at DESC);

CREATE INDEX agency_clients_vertical_created_at_idx
  ON public.agency_clients (vertical, created_at DESC);

CREATE INDEX agency_client_domains_client_created_at_idx
  ON public.agency_client_domains (agency_client_id, created_at DESC);

CREATE INDEX agency_feature_flags_account_created_at_idx
  ON public.agency_feature_flags (agency_account_id, created_at DESC);

CREATE INDEX agency_model_policies_account_created_at_idx
  ON public.agency_model_policies (agency_account_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_agency_account_member(account_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_users au
    WHERE au.agency_account_id = account_uuid
      AND au.user_id = auth.uid()
      AND au.status = 'active'
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.is_agency_client_member(client_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_clients ac
    JOIN public.agency_users au
      ON au.agency_account_id = ac.agency_account_id
    WHERE ac.id = client_uuid
      AND au.user_id = auth.uid()
      AND au.status = 'active'
  );
$$ LANGUAGE sql STABLE;

ALTER TABLE public.agency_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_client_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_model_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_accounts_member_read" ON public.agency_accounts
  FOR SELECT
  USING (public.is_agency_account_member(id));

CREATE POLICY "agency_users_member_read" ON public.agency_users
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_agency_account_member(agency_account_id)
  );

CREATE POLICY "agency_clients_member_read" ON public.agency_clients
  FOR SELECT
  USING (public.is_agency_account_member(agency_account_id));

CREATE POLICY "agency_client_domains_member_read" ON public.agency_client_domains
  FOR SELECT
  USING (public.is_agency_client_member(agency_client_id));

CREATE POLICY "agency_feature_flags_member_read" ON public.agency_feature_flags
  FOR SELECT
  USING (public.is_agency_account_member(agency_account_id));

CREATE POLICY "agency_model_policies_member_read" ON public.agency_model_policies
  FOR SELECT
  USING (public.is_agency_account_member(agency_account_id));

ALTER TABLE public.scans
  ADD COLUMN agency_account_id UUID REFERENCES public.agency_accounts(id) ON DELETE SET NULL,
  ADD COLUMN agency_client_id UUID REFERENCES public.agency_clients(id) ON DELETE SET NULL,
  ADD COLUMN run_source TEXT NOT NULL DEFAULT 'public_self_serve',
  ADD COLUMN requested_model_policy TEXT,
  ADD COLUMN effective_model TEXT,
  ADD COLUMN vertical_snapshot TEXT,
  ADD COLUMN subvertical_snapshot TEXT;

ALTER TABLE public.reports
  ADD COLUMN agency_account_id UUID REFERENCES public.agency_accounts(id) ON DELETE SET NULL,
  ADD COLUMN agency_client_id UUID REFERENCES public.agency_clients(id) ON DELETE SET NULL;

ALTER TABLE public.scans
  ADD CONSTRAINT scans_run_source_check CHECK (
    run_source IN ('public_self_serve', 'agency_dashboard', 'internal_benchmark', 'admin_manual')
  );

CREATE INDEX scans_agency_account_created_at_idx
  ON public.scans (agency_account_id, created_at DESC);

CREATE INDEX scans_agency_client_created_at_idx
  ON public.scans (agency_client_id, created_at DESC);

CREATE INDEX scans_run_source_created_at_idx
  ON public.scans (run_source, created_at DESC);

CREATE INDEX reports_agency_account_created_at_idx
  ON public.reports (agency_account_id, created_at DESC);

CREATE INDEX reports_agency_client_created_at_idx
  ON public.reports (agency_client_id, created_at DESC);

CREATE POLICY "scans_agency_member_read" ON public.scans
  FOR SELECT
  USING (
    agency_account_id IS NOT NULL
    AND public.is_agency_account_member(agency_account_id)
  );

CREATE POLICY "reports_agency_member_read" ON public.reports
  FOR SELECT
  USING (
    agency_account_id IS NOT NULL
    AND public.is_agency_account_member(agency_account_id)
  );

CREATE TRIGGER agency_accounts_updated_at
  BEFORE UPDATE ON public.agency_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER agency_users_updated_at
  BEFORE UPDATE ON public.agency_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER agency_clients_updated_at
  BEFORE UPDATE ON public.agency_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER agency_client_domains_updated_at
  BEFORE UPDATE ON public.agency_client_domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER agency_feature_flags_updated_at
  BEFORE UPDATE ON public.agency_feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER agency_model_policies_updated_at
  BEFORE UPDATE ON public.agency_model_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.agency_accounts IS 'Agency workspace accounts for pilot and future multi-client GEO-Pulse access.';
COMMENT ON TABLE public.agency_users IS 'Auth-user membership records within an agency account.';
COMMENT ON TABLE public.agency_clients IS 'Client records managed under an agency account, including the agency itself when needed.';
COMMENT ON TABLE public.agency_client_domains IS 'Tracked domains belonging to one agency client.';
COMMENT ON TABLE public.agency_feature_flags IS 'Admin-controlled account and client entitlements for agency product surfaces.';
COMMENT ON TABLE public.agency_model_policies IS 'Account-level or client-level model selection policy for audit and benchmark-related surfaces.';

COMMENT ON COLUMN public.agency_accounts.billing_mode IS 'Pilot and future billing control mode; pilot_exempt bypasses Stripe for approved accounts.';
COMMENT ON COLUMN public.agency_accounts.benchmark_vertical IS 'Primary vertical lens for future benchmark-aware segmentation.';
COMMENT ON COLUMN public.agency_clients.icp_tag IS 'Short ICP or service concentration tag such as medical_clinics.';
COMMENT ON COLUMN public.scans.run_source IS 'Source of the audit launch so product usage and benchmark work stay distinguishable.';
COMMENT ON COLUMN public.scans.requested_model_policy IS 'Requested model policy key or label at audit launch time.';
COMMENT ON COLUMN public.scans.effective_model IS 'Effective model id actually used for this audit run.';
