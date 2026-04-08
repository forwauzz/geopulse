-- BILL-014: RLS policies for service entitlement tables (021 enabled RLS without policies).
-- Authenticated users need read access for dashboard entitlement resolution; writes stay service-role only.

-- ── Reference data (product config) ─────────────────────────────────────────
CREATE POLICY "service_catalog_authenticated_select"
  ON public.service_catalog
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "service_bundles_authenticated_select"
  ON public.service_bundles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "service_bundle_services_authenticated_select"
  ON public.service_bundle_services
  FOR SELECT
  TO authenticated
  USING (true);

-- ── Entitlement overrides: least-privilege by scope ─────────────────────────
CREATE POLICY "service_entitlement_overrides_select_global"
  ON public.service_entitlement_overrides
  FOR SELECT
  TO authenticated
  USING (scope_type = 'global');

CREATE POLICY "service_entitlement_overrides_select_bundle_default"
  ON public.service_entitlement_overrides
  FOR SELECT
  TO authenticated
  USING (scope_type = 'bundle_default');

CREATE POLICY "service_entitlement_overrides_select_agency_account"
  ON public.service_entitlement_overrides
  FOR SELECT
  TO authenticated
  USING (
    scope_type = 'agency_account'
    AND EXISTS (
      SELECT 1
      FROM public.agency_users au
      WHERE au.agency_account_id = service_entitlement_overrides.agency_account_id
        AND au.user_id = auth.uid()
        AND au.status = 'active'
    )
  );

CREATE POLICY "service_entitlement_overrides_select_agency_client"
  ON public.service_entitlement_overrides
  FOR SELECT
  TO authenticated
  USING (
    scope_type = 'agency_client'
    AND EXISTS (
      SELECT 1
      FROM public.agency_clients c
      INNER JOIN public.agency_users au ON au.agency_account_id = c.agency_account_id
      WHERE c.id = service_entitlement_overrides.agency_client_id
        AND au.user_id = auth.uid()
        AND au.status = 'active'
    )
  );

CREATE POLICY "service_entitlement_overrides_select_user"
  ON public.service_entitlement_overrides
  FOR SELECT
  TO authenticated
  USING (
    scope_type = 'user'
    AND user_id = auth.uid()
  );

-- ── Model policies (resolveStartupServiceModelPolicy, etc.) ──────────────────
CREATE POLICY "service_model_policies_select_service_default"
  ON public.service_model_policies
  FOR SELECT
  TO authenticated
  USING (scope_type = 'service_default');

CREATE POLICY "service_model_policies_select_bundle"
  ON public.service_model_policies
  FOR SELECT
  TO authenticated
  USING (scope_type = 'bundle');

CREATE POLICY "service_model_policies_select_agency_account"
  ON public.service_model_policies
  FOR SELECT
  TO authenticated
  USING (
    scope_type = 'agency_account'
    AND EXISTS (
      SELECT 1
      FROM public.agency_users au
      WHERE au.agency_account_id = service_model_policies.agency_account_id
        AND au.user_id = auth.uid()
        AND au.status = 'active'
    )
  );

CREATE POLICY "service_model_policies_select_agency_client"
  ON public.service_model_policies
  FOR SELECT
  TO authenticated
  USING (
    scope_type = 'agency_client'
    AND EXISTS (
      SELECT 1
      FROM public.agency_clients c
      INNER JOIN public.agency_users au ON au.agency_account_id = c.agency_account_id
      WHERE c.id = service_model_policies.agency_client_id
        AND au.user_id = auth.uid()
        AND au.status = 'active'
    )
  );

CREATE POLICY "service_model_policies_select_startup_workspace"
  ON public.service_model_policies
  FOR SELECT
  TO authenticated
  USING (
    scope_type = 'startup_workspace'::public.service_model_policy_scope
    AND startup_workspace_id IS NOT NULL
    AND public.is_startup_workspace_member(startup_workspace_id)
  );

COMMENT ON POLICY "service_entitlement_overrides_select_agency_account" ON public.service_entitlement_overrides IS
  'BILL-014: members may read agency-scoped overrides for accounts they belong to.';
