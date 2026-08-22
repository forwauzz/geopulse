import { isExcludedRevenueIdentity, normalizedRevenueDomain } from './revenue-identity';

export type AuditEvidence = {
  readonly domain: string | null | undefined;
  readonly runSource: string | null | undefined;
  readonly reportEmail: string | null | undefined;
  readonly prospectEmails?: readonly string[];
};

function normalizedEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function engagementEvidenceKey(scanId: string, email: string): string {
  return `${scanId}:${normalizedEmail(email)}`;
}

/**
 * A generated report is not buyer engagement by itself. Count it only when the public self-serve
 * flow names a real external recipient and that recipient is attributable either to the audited
 * business domain or to an existing outreach prospect.
 */
export function isVerifiedExternalAuditRequest(evidence: AuditEvidence): boolean {
  if (evidence.runSource !== 'public_self_serve') return false;
  const reportEmail = normalizedEmail(evidence.reportEmail);
  const domain = normalizedRevenueDomain(evidence.domain);
  if (!reportEmail || !domain || isExcludedRevenueIdentity({ email: reportEmail, domain })) return false;

  const prospects = new Set((evidence.prospectEmails ?? []).map(normalizedEmail).filter(Boolean));
  if (prospects.has(reportEmail)) return true;

  const emailDomain = reportEmail.split('@')[1] ?? '';
  return emailDomain === domain || emailDomain.endsWith(`.${domain}`);
}

/** One rendered report can emit multiple server-side serve logs. Count one possible visit per scan. */
export function uniqueReportViewScanIds(
  rows: readonly { data?: { scanId?: string | null } | null }[]
): string[] {
  return [...new Set(rows.map((row) => row.data?.scanId?.trim()).filter((id): id is string => Boolean(id)))];
}
