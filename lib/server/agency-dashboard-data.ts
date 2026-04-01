import { resolveAgencyFeatureEntitlements, type AgencyFeatureEntitlements } from './agency-access';

type SupabaseLike = {
  from(table: string): any;
};

export type AgencyDashboardAccount = {
  readonly id: string;
  readonly accountKey: string;
  readonly name: string;
  readonly benchmarkVertical: string | null;
  readonly benchmarkSubvertical: string | null;
  readonly clients: AgencyDashboardClient[];
};

export type AgencyDashboardClient = {
  readonly id: string;
  readonly agencyAccountId: string;
  readonly clientKey: string;
  readonly name: string;
  readonly canonicalDomain: string | null;
  readonly vertical: string | null;
  readonly subvertical: string | null;
  readonly icpTag: string | null;
};

export type AgencyDashboardClientDomain = {
  readonly id: string;
  readonly agencyClientId: string;
  readonly domain: string;
  readonly canonicalDomain: string;
  readonly siteUrl: string | null;
  readonly isPrimary: boolean;
};

export type AgencyDashboardScan = {
  readonly id: string;
  readonly agencyAccountId: string | null;
  readonly agencyClientId: string | null;
  readonly url: string;
  readonly domain: string;
  readonly score: number | null;
  readonly letterGrade: string | null;
  readonly createdAt: string;
  readonly runSource: string;
};

export type AgencyDashboardReport = {
  readonly id: string;
  readonly scanId: string | null;
  readonly agencyAccountId: string | null;
  readonly agencyClientId: string | null;
  readonly type: string;
  readonly emailDeliveredAt: string | null;
  readonly pdfGeneratedAt: string | null;
  readonly pdfUrl: string | null;
};

export type AgencyDashboardData = {
  readonly accounts: AgencyDashboardAccount[];
  readonly selectedAccountId: string | null;
  readonly selectedClientId: string | null;
  readonly selectedClientDomains: AgencyDashboardClientDomain[];
  readonly scans: AgencyDashboardScan[];
  readonly reports: AgencyDashboardReport[];
  readonly entitlements: AgencyFeatureEntitlements;
};

export async function getAgencyDashboardData(args: {
  readonly supabase: SupabaseLike;
  readonly userId: string;
  readonly selectedAccountId?: string | null;
  readonly selectedClientId?: string | null;
}): Promise<AgencyDashboardData> {
  const { supabase, userId } = args;

  const { data: memberships, error: membershipsError } = await supabase
    .from('agency_users')
    .select('agency_account_id,status')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (membershipsError) throw membershipsError;

  const accountIds = Array.from(
    new Set(
      (((memberships ?? []) as Array<{ agency_account_id: string }>).map(
        (row) => row.agency_account_id
      ) ?? []).filter(Boolean)
    )
  );

  if (accountIds.length === 0) {
    return {
      accounts: [],
      selectedAccountId: null,
      selectedClientId: null,
      selectedClientDomains: [],
      scans: [],
      reports: [],
      entitlements: {
        agencyDashboardEnabled: true,
        scanLaunchEnabled: true,
        reportHistoryEnabled: true,
        deepAuditEnabled: true,
        geoTrackerEnabled: false,
      },
    };
  }

  const [
    { data: accounts, error: accountsError },
    { data: clients, error: clientsError },
  ] = await Promise.all([
    supabase
      .from('agency_accounts')
      .select('id,account_key,name,benchmark_vertical,benchmark_subvertical')
      .in('id', accountIds)
      .order('created_at', { ascending: true }),
    supabase
      .from('agency_clients')
      .select('id,agency_account_id,client_key,name,canonical_domain,vertical,subvertical,icp_tag,status')
      .in('agency_account_id', accountIds)
      .eq('status', 'active')
      .order('created_at', { ascending: true }),
  ]);

  if (accountsError || clientsError) throw accountsError ?? clientsError;

  const accountRows = (accounts ?? []) as Array<{
    id: string;
    account_key: string;
    name: string;
    benchmark_vertical: string | null;
    benchmark_subvertical: string | null;
  }>;

  const clientRows = (clients ?? []) as Array<{
    id: string;
    agency_account_id: string;
    client_key: string;
    name: string;
    canonical_domain: string | null;
    vertical: string | null;
    subvertical: string | null;
    icp_tag: string | null;
  }>;

  const allowedAccountIds = new Set(accountRows.map((row) => row.id));
  const selectedAccountId =
    args.selectedAccountId && allowedAccountIds.has(args.selectedAccountId)
      ? args.selectedAccountId
      : accountRows[0]?.id ?? null;

  const selectedAccountClients = clientRows.filter(
    (row) => !selectedAccountId || row.agency_account_id === selectedAccountId
  );
  const allowedClientIds = new Set(selectedAccountClients.map((row) => row.id));
  const selectedClientId =
    args.selectedClientId && allowedClientIds.has(args.selectedClientId)
      ? args.selectedClientId
      : null;

  const selectedClientIds =
    selectedClientId !== null
      ? [selectedClientId]
      : selectedAccountClients.map((row) => row.id);

  let scansQuery = supabase
    .from('scans')
    .select('id,agency_account_id,agency_client_id,url,domain,score,letter_grade,created_at,run_source')
    .in('agency_account_id', selectedAccountId ? [selectedAccountId] : accountRows.map((row) => row.id))
    .order('created_at', { ascending: false });

  if (selectedClientId) {
    scansQuery = scansQuery.eq('agency_client_id', selectedClientId);
  }

  let reportsQuery = supabase
    .from('reports')
    .select('id,scan_id,agency_account_id,agency_client_id,type,email_delivered_at,pdf_generated_at,pdf_url')
    .in('agency_account_id', selectedAccountId ? [selectedAccountId] : accountRows.map((row) => row.id))
    .order('created_at', { ascending: false });

  if (selectedClientId) {
    reportsQuery = reportsQuery.eq('agency_client_id', selectedClientId);
  }

  const [{ data: scans, error: scansError }, { data: reports, error: reportsError }] =
    await Promise.all([scansQuery, reportsQuery]);

  if (scansError || reportsError) throw scansError ?? reportsError;

  const { data: domains, error: domainsError } =
    selectedClientIds.length > 0
      ? await supabase
          .from('agency_client_domains')
          .select('id,agency_client_id,domain,canonical_domain,site_url,is_primary')
          .in('agency_client_id', selectedClientIds)
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: true })
      : { data: [], error: null };

  if (domainsError) throw domainsError;

  const entitlements = await resolveAgencyFeatureEntitlements({
    supabase,
    agencyAccountId: selectedAccountId,
    agencyClientId: selectedClientId,
  });

  const clientsByAccount = new Map<string, AgencyDashboardClient[]>();
  for (const row of clientRows) {
    const existing = clientsByAccount.get(row.agency_account_id) ?? [];
    existing.push({
      id: row.id,
      agencyAccountId: row.agency_account_id,
      clientKey: row.client_key,
      name: row.name,
      canonicalDomain: row.canonical_domain,
      vertical: row.vertical,
      subvertical: row.subvertical,
      icpTag: row.icp_tag,
    });
    clientsByAccount.set(row.agency_account_id, existing);
  }

  return {
    accounts: accountRows.map((row) => ({
      id: row.id,
      accountKey: row.account_key,
      name: row.name,
      benchmarkVertical: row.benchmark_vertical,
      benchmarkSubvertical: row.benchmark_subvertical,
      clients: clientsByAccount.get(row.id) ?? [],
    })),
    selectedAccountId,
    selectedClientId,
    scans: ((scans ?? []) as Array<{
      id: string;
      agency_account_id: string | null;
      agency_client_id: string | null;
      url: string;
      domain: string;
      score: number | null;
      letter_grade: string | null;
      created_at: string;
      run_source: string | null;
    }>).map((row) => ({
      id: row.id,
      agencyAccountId: row.agency_account_id,
      agencyClientId: row.agency_client_id,
      url: row.url,
      domain: row.domain,
      score: row.score,
      letterGrade: row.letter_grade,
      createdAt: row.created_at,
      runSource: row.run_source ?? 'public_self_serve',
    })),
    entitlements,
    selectedClientDomains: ((domains ?? []) as Array<{
      id: string;
      agency_client_id: string;
      domain: string;
      canonical_domain: string;
      site_url: string | null;
      is_primary: boolean;
    }>).map((row) => ({
      id: row.id,
      agencyClientId: row.agency_client_id,
      domain: row.domain,
      canonicalDomain: row.canonical_domain,
      siteUrl: row.site_url,
      isPrimary: row.is_primary,
    })),
    reports: ((reports ?? []) as Array<{
      id: string;
      scan_id: string | null;
      agency_account_id: string | null;
      agency_client_id: string | null;
      type: string;
      email_delivered_at: string | null;
      pdf_generated_at: string | null;
      pdf_url: string | null;
    }>).map((row) => ({
      id: row.id,
      scanId: row.scan_id,
      agencyAccountId: row.agency_account_id,
      agencyClientId: row.agency_client_id,
      type: row.type,
      emailDeliveredAt: row.email_delivered_at,
      pdfGeneratedAt: row.pdf_generated_at,
      pdfUrl: row.pdf_url,
    })),
  };
}
