type SupabaseLike = {
  from(table: string): any;
};

export type AgencyScanIdentity = {
  readonly agencyAccountId: string | null;
  readonly agencyClientId: string | null;
};

export type AgencyScanAccessResult = {
  readonly isMember: boolean;
  readonly paymentRequired: boolean;
};

export type AgencyFeatureEntitlements = {
  readonly agencyDashboardEnabled: boolean;
  readonly scanLaunchEnabled: boolean;
  readonly reportHistoryEnabled: boolean;
  readonly deepAuditEnabled: boolean;
  readonly geoTrackerEnabled: boolean;
};

const DEFAULT_ENTITLEMENTS: AgencyFeatureEntitlements = {
  agencyDashboardEnabled: true,
  scanLaunchEnabled: true,
  reportHistoryEnabled: true,
  deepAuditEnabled: true,
  geoTrackerEnabled: false,
};

async function loadFeatureFlag(args: {
  readonly supabase: SupabaseLike;
  readonly agencyAccountId: string;
  readonly agencyClientId: string | null;
  readonly flagKey: string;
}): Promise<boolean | null> {
  const { supabase, agencyAccountId, agencyClientId, flagKey } = args;

  if (agencyClientId) {
    const { data: clientFlag, error: clientFlagError } = await supabase
      .from('agency_feature_flags')
      .select('enabled')
      .eq('agency_account_id', agencyAccountId)
      .eq('agency_client_id', agencyClientId)
      .eq('flag_key', flagKey)
      .maybeSingle();

    if (clientFlagError) throw clientFlagError;
    if (clientFlag && typeof clientFlag.enabled === 'boolean') {
      return clientFlag.enabled;
    }
  }

  const { data: accountFlag, error: accountFlagError } = await supabase
    .from('agency_feature_flags')
    .select('enabled')
    .eq('agency_account_id', agencyAccountId)
    .is('agency_client_id', null)
    .eq('flag_key', flagKey)
    .maybeSingle();

  if (accountFlagError) throw accountFlagError;
  if (accountFlag && typeof accountFlag.enabled === 'boolean') {
    return accountFlag.enabled;
  }

  return null;
}

export async function validateAgencyContext(args: {
  readonly supabase: SupabaseLike;
  readonly userId: string;
  readonly agencyAccountId: string | null;
  readonly agencyClientId: string | null;
}): Promise<boolean> {
  const { supabase, userId, agencyAccountId, agencyClientId } = args;
  if (!agencyAccountId) return false;

  const { data: membership, error: membershipError } = await supabase
    .from('agency_users')
    .select('id')
    .eq('agency_account_id', agencyAccountId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership?.id) return false;

  if (agencyClientId) {
    const { data: client, error: clientError } = await supabase
      .from('agency_clients')
      .select('id')
      .eq('id', agencyClientId)
      .eq('agency_account_id', agencyAccountId)
      .eq('status', 'active')
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client?.id) return false;
  }

  return true;
}

export async function resolveAgencyFeatureEntitlements(args: {
  readonly supabase: SupabaseLike;
  readonly agencyAccountId: string | null;
  readonly agencyClientId: string | null;
}): Promise<AgencyFeatureEntitlements> {
  const { supabase, agencyAccountId, agencyClientId } = args;

  if (!agencyAccountId) {
    return DEFAULT_ENTITLEMENTS;
  }

  const [
    agencyDashboardEnabled,
    scanLaunchEnabled,
    reportHistoryEnabled,
    deepAuditEnabled,
    geoTrackerEnabled,
  ] = await Promise.all([
    loadFeatureFlag({
      supabase,
      agencyAccountId,
      agencyClientId,
      flagKey: 'agency_dashboard_enabled',
    }),
    loadFeatureFlag({
      supabase,
      agencyAccountId,
      agencyClientId,
      flagKey: 'scan_launch_enabled',
    }),
    loadFeatureFlag({
      supabase,
      agencyAccountId,
      agencyClientId,
      flagKey: 'report_history_enabled',
    }),
    loadFeatureFlag({
      supabase,
      agencyAccountId,
      agencyClientId,
      flagKey: 'deep_audit_enabled',
    }),
    loadFeatureFlag({
      supabase,
      agencyAccountId,
      agencyClientId,
      flagKey: 'geo_tracker_enabled',
    }),
  ]);

  return {
    agencyDashboardEnabled: agencyDashboardEnabled ?? DEFAULT_ENTITLEMENTS.agencyDashboardEnabled,
    scanLaunchEnabled: scanLaunchEnabled ?? DEFAULT_ENTITLEMENTS.scanLaunchEnabled,
    reportHistoryEnabled: reportHistoryEnabled ?? DEFAULT_ENTITLEMENTS.reportHistoryEnabled,
    deepAuditEnabled: deepAuditEnabled ?? DEFAULT_ENTITLEMENTS.deepAuditEnabled,
    geoTrackerEnabled: geoTrackerEnabled ?? DEFAULT_ENTITLEMENTS.geoTrackerEnabled,
  };
}

export async function resolveAgencyScanAccess(args: {
  readonly supabase: SupabaseLike;
  readonly userId: string;
  readonly scan: AgencyScanIdentity;
}): Promise<AgencyScanAccessResult> {
  const { supabase, userId, scan } = args;

  if (!scan.agencyAccountId) {
    return { isMember: false, paymentRequired: true };
  }

  const isMember = await validateAgencyContext({
    supabase,
    userId,
    agencyAccountId: scan.agencyAccountId,
    agencyClientId: scan.agencyClientId,
  });

  if (!isMember) {
    return { isMember: false, paymentRequired: true };
  }

  const paymentRequiredFlag = await loadFeatureFlag({
    supabase,
    agencyAccountId: scan.agencyAccountId,
    agencyClientId: scan.agencyClientId,
    flagKey: 'payment_required',
  });

  return {
    isMember: true,
    paymentRequired: paymentRequiredFlag ?? true,
  };
}
