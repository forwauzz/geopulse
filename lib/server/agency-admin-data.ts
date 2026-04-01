type SupabaseLike = {
  from(table: string): any;
};

export type AgencyAccountAdminRow = {
  readonly id: string;
  readonly account_key: string;
  readonly name: string;
  readonly website_domain: string | null;
  readonly canonical_domain: string | null;
  readonly status: string;
  readonly billing_mode: string;
  readonly benchmark_vertical: string | null;
  readonly benchmark_subvertical: string | null;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
};

export type AgencyClientAdminRow = {
  readonly id: string;
  readonly agency_account_id: string;
  readonly client_key: string;
  readonly name: string;
  readonly display_name: string | null;
  readonly website_domain: string | null;
  readonly canonical_domain: string | null;
  readonly status: string;
  readonly vertical: string | null;
  readonly subvertical: string | null;
  readonly icp_tag: string | null;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
};

export type AgencyFeatureFlagAdminRow = {
  readonly id: string;
  readonly agency_account_id: string;
  readonly agency_client_id: string | null;
  readonly flag_key: string;
  readonly enabled: boolean;
  readonly config: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
};

export type AgencyModelPolicyAdminRow = {
  readonly id: string;
  readonly agency_account_id: string;
  readonly agency_client_id: string | null;
  readonly product_surface: string;
  readonly provider_name: string;
  readonly model_id: string;
  readonly is_active: boolean;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
};

export type AgencyUserAdminRow = {
  readonly id: string;
  readonly agency_account_id: string;
  readonly user_id: string;
  readonly role: string;
  readonly status: string;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
  readonly email: string | null;
};

export type AgencyAccountAdminDetail = AgencyAccountAdminRow & {
  readonly clients: AgencyClientAdminRow[];
  readonly users: AgencyUserAdminRow[];
  readonly featureFlags: AgencyFeatureFlagAdminRow[];
  readonly modelPolicies: AgencyModelPolicyAdminRow[];
};

function normalizeObject(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return value ?? {};
}

export function createAgencyAdminData(supabase: SupabaseLike) {
  return {
    async getAccounts(): Promise<AgencyAccountAdminDetail[]> {
      const [
        { data: accounts, error: accountsError },
        { data: clients, error: clientsError },
        { data: users, error: usersError },
        { data: flags, error: flagsError },
        { data: policies, error: policiesError },
      ] = await Promise.all([
        supabase
          .from('agency_accounts')
          .select(
            'id,account_key,name,website_domain,canonical_domain,status,billing_mode,benchmark_vertical,benchmark_subvertical,metadata,created_at,updated_at'
          )
          .order('created_at', { ascending: true }),
        supabase
          .from('agency_clients')
          .select(
            'id,agency_account_id,client_key,name,display_name,website_domain,canonical_domain,status,vertical,subvertical,icp_tag,metadata,created_at,updated_at'
          )
          .order('created_at', { ascending: true }),
        supabase
          .from('agency_users')
          .select('id,agency_account_id,user_id,role,status,metadata,created_at,updated_at')
          .order('created_at', { ascending: true }),
        supabase
          .from('agency_feature_flags')
          .select('id,agency_account_id,agency_client_id,flag_key,enabled,config,metadata,created_at,updated_at')
          .order('created_at', { ascending: true }),
        supabase
          .from('agency_model_policies')
          .select(
            'id,agency_account_id,agency_client_id,product_surface,provider_name,model_id,is_active,metadata,created_at,updated_at'
          )
          .order('created_at', { ascending: true }),
      ]);

      if (accountsError || clientsError || usersError || flagsError || policiesError) {
        throw accountsError ?? clientsError ?? usersError ?? flagsError ?? policiesError;
      }

      const userRows = (users ?? []) as Array<{
        id: string;
        agency_account_id: string;
        user_id: string;
        role: string;
        status: string;
        metadata: Record<string, unknown> | null;
        created_at: string;
        updated_at: string;
      }>;

      const userIds = Array.from(new Set(userRows.map((row) => row.user_id)));
      const { data: linkedUsers, error: linkedUsersError } =
        userIds.length > 0
          ? await supabase.from('users').select('id,email').in('id', userIds)
          : { data: [], error: null };

      if (linkedUsersError) {
        throw linkedUsersError;
      }

      const emailByUserId = new Map(
        (((linkedUsers ?? []) as Array<{ id: string; email: string | null }>) ?? []).map((row) => [
          row.id,
          row.email,
        ])
      );

      const clientsByAccount = new Map<string, AgencyClientAdminRow[]>();
      for (const row of ((clients ?? []) as AgencyClientAdminRow[]).map((row) => ({
        ...row,
        metadata: normalizeObject(row.metadata),
      }))) {
        const existing = clientsByAccount.get(row.agency_account_id) ?? [];
        existing.push(row);
        clientsByAccount.set(row.agency_account_id, existing);
      }

      const usersByAccount = new Map<string, AgencyUserAdminRow[]>();
      for (const row of userRows) {
        const normalized: AgencyUserAdminRow = {
          ...row,
          metadata: normalizeObject(row.metadata),
          email: emailByUserId.get(row.user_id) ?? null,
        };
        const existing = usersByAccount.get(row.agency_account_id) ?? [];
        existing.push(normalized);
        usersByAccount.set(row.agency_account_id, existing);
      }

      const flagsByAccount = new Map<string, AgencyFeatureFlagAdminRow[]>();
      for (const row of ((flags ?? []) as AgencyFeatureFlagAdminRow[]).map((row) => ({
        ...row,
        config: normalizeObject(row.config),
        metadata: normalizeObject(row.metadata),
      }))) {
        const existing = flagsByAccount.get(row.agency_account_id) ?? [];
        existing.push(row);
        flagsByAccount.set(row.agency_account_id, existing);
      }

      const policiesByAccount = new Map<string, AgencyModelPolicyAdminRow[]>();
      for (const row of ((policies ?? []) as AgencyModelPolicyAdminRow[]).map((row) => ({
        ...row,
        metadata: normalizeObject(row.metadata),
      }))) {
        const existing = policiesByAccount.get(row.agency_account_id) ?? [];
        existing.push(row);
        policiesByAccount.set(row.agency_account_id, existing);
      }

      return ((accounts ?? []) as AgencyAccountAdminRow[]).map((row) => ({
        ...row,
        metadata: normalizeObject(row.metadata),
        clients: clientsByAccount.get(row.id) ?? [],
        users: usersByAccount.get(row.id) ?? [],
        featureFlags: flagsByAccount.get(row.id) ?? [],
        modelPolicies: policiesByAccount.get(row.id) ?? [],
      }));
    },
  };
}
