import { structuredError, structuredLog } from './structured-log';

type SupabaseLike = {
  from(table: string): any;
};

type ClientRow = {
  readonly id: string;
  readonly agency_account_id: string;
  readonly canonical_domain: string | null;
};

type DomainRow = {
  readonly agency_client_id: string;
  readonly canonical_domain: string;
};

type ScanRow = {
  readonly id: string;
  readonly agency_account_id: string;
  readonly domain: string;
  readonly agency_client_id?: string | null;
};

type ReportRow = {
  readonly id: string;
  readonly scan_id: string | null;
};

export type AgencyArtifactAssignment = {
  readonly recordId: string;
  readonly agencyClientId: string;
};

function normalizeDomain(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? '';
  if (!trimmed) return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, '').replace(/\.$/, '') || null;
  } catch {
    return trimmed.replace(/^www\./, '').replace(/\.$/, '') || null;
  }
}

export function planAgencyArtifactAssignments(args: {
  readonly clients: readonly ClientRow[];
  readonly domains: readonly DomainRow[];
  readonly scans: readonly ScanRow[];
  readonly reports: readonly ReportRow[];
}): {
  readonly scans: readonly AgencyArtifactAssignment[];
  readonly reports: readonly AgencyArtifactAssignment[];
} {
  const clientByDomain = new Map<string, string | null>();
  const addDomain = (domain: string | null, clientId: string) => {
    if (!domain) return;
    const existing = clientByDomain.get(domain);
    clientByDomain.set(domain, existing && existing !== clientId ? null : clientId);
  };

  for (const client of args.clients) {
    addDomain(normalizeDomain(client.canonical_domain), client.id);
  }
  for (const domain of args.domains) {
    addDomain(normalizeDomain(domain.canonical_domain), domain.agency_client_id);
  }

  const accountByClient = new Map(args.clients.map((client) => [client.id, client.agency_account_id]));
  const scanAssignments: AgencyArtifactAssignment[] = [];
  const clientByScan = new Map<string, string>();

  for (const scan of args.scans) {
    const existingClientId = scan.agency_client_id ?? null;
    if (existingClientId && accountByClient.get(existingClientId) === scan.agency_account_id) {
      clientByScan.set(scan.id, existingClientId);
      continue;
    }
    const clientId = clientByDomain.get(normalizeDomain(scan.domain) ?? '');
    if (!clientId || accountByClient.get(clientId) !== scan.agency_account_id) continue;
    scanAssignments.push({ recordId: scan.id, agencyClientId: clientId });
    clientByScan.set(scan.id, clientId);
  }

  const reportAssignments = args.reports.flatMap((report) => {
    const clientId = report.scan_id ? clientByScan.get(report.scan_id) : null;
    return clientId ? [{ recordId: report.id, agencyClientId: clientId }] : [];
  });

  return { scans: scanAssignments, reports: reportAssignments };
}

export async function reconcileAgencyHistoricalArtifacts(args: {
  readonly supabase: SupabaseLike;
  readonly userId: string;
}): Promise<{ readonly scans: number; readonly reports: number }> {
  try {
    const { data: memberships, error: membershipError } = await args.supabase
      .from('agency_users')
      .select('agency_account_id')
      .eq('user_id', args.userId)
      .eq('status', 'active');
    if (membershipError) throw membershipError;

    const accountIds = Array.from(
      new Set(
        ((memberships ?? []) as Array<{ agency_account_id: string }>)
          .map((row) => row.agency_account_id)
          .filter(Boolean),
      ),
    );
    if (accountIds.length === 0) return { scans: 0, reports: 0 };

    const { data: clients, error: clientsError } = await args.supabase
      .from('agency_clients')
      .select('id,agency_account_id,canonical_domain')
      .in('agency_account_id', accountIds)
      .eq('status', 'active');
    if (clientsError) throw clientsError;

    const clientRows = (clients ?? []) as ClientRow[];
    const clientIds = clientRows.map((client) => client.id);
    if (clientIds.length === 0) return { scans: 0, reports: 0 };

    const [
      { data: domains, error: domainsError },
      { data: scans, error: scansError },
      { data: reports, error: reportsError },
    ] = await Promise.all([
      args.supabase
        .from('agency_client_domains')
        .select('agency_client_id,canonical_domain')
        .in('agency_client_id', clientIds),
      args.supabase
        .from('scans')
        .select('id,agency_account_id,agency_client_id,domain')
        .in('agency_account_id', accountIds),
      args.supabase
        .from('reports')
        .select('id,scan_id')
        .in('agency_account_id', accountIds)
        .is('agency_client_id', null),
    ]);
    if (domainsError || scansError || reportsError) {
      throw domainsError ?? scansError ?? reportsError;
    }

    const plan = planAgencyArtifactAssignments({
      clients: clientRows,
      domains: (domains ?? []) as DomainRow[],
      scans: (scans ?? []) as ScanRow[],
      reports: (reports ?? []) as ReportRow[],
    });

    const writes = await Promise.all([
      ...plan.scans.map((assignment) =>
        args.supabase
          .from('scans')
          .update({ agency_client_id: assignment.agencyClientId })
          .eq('id', assignment.recordId)
          .is('agency_client_id', null),
      ),
      ...plan.reports.map((assignment) =>
        args.supabase
          .from('reports')
          .update({ agency_client_id: assignment.agencyClientId })
          .eq('id', assignment.recordId)
          .is('agency_client_id', null),
      ),
    ]);
    const failedWrite = writes.find((write) => write?.error);
    if (failedWrite?.error) throw failedWrite.error;

    if (plan.scans.length || plan.reports.length) {
      structuredLog(
        'agency_historical_artifacts_reconciled',
        { userId: args.userId, scans: plan.scans.length, reports: plan.reports.length },
        'info',
      );
    }
    return { scans: plan.scans.length, reports: plan.reports.length };
  } catch (error) {
    structuredError('agency_historical_artifact_reconciliation_failed', {
      userId: args.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { scans: 0, reports: 0 };
  }
}
