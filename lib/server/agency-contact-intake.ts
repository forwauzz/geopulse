/**
 * Agency contact intake (VCI-8 / ECP-1) — the first slice of the centralized email campaign
 * control room.
 *
 * The founder's bundle contains three source classes that must never blur into each other:
 *
 *   1. published addresses the person put on a public page  → CASL implied-consent evidence
 *   2. pattern-constructed guesses ("first@domain", 62% hit) → NO consent basis, ever
 *   3. names with no address, plus superseded exports        → provenance/rejection evidence only
 *
 * The word "verified" in the bundle means "published", not "mailbox-deliverable". Nothing here
 * upgrades an address to sendable on that basis alone, and every rule below is restrictive by
 * default: a row we cannot positively classify stays `needs_verification`.
 *
 * Planning is pure and side-effect free — that IS the dry run. `applyContactIntake` writes the
 * exact plan the dry run printed, so the counts an operator reviewed are the counts that land.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from './supabase-page';

// ── Contracts ───────────────────────────────────────────────────────────────────

export type ContactSourceClass =
  | 'verified_published'
  | 'constructed_unverified'
  | 'rejection_evidence'
  | 'operator_manual';

export type ContactEligibility =
  | 'eligible'
  | 'needs_verification'
  | 'suppressed'
  | 'rejected'
  | 'enrolled'
  | 'converted';

/** Mutually exclusive outcome bucket for one source row; the six counts the spec requires. */
export type IntakeDecision =
  | 'insert'
  | 'merge'
  | 'duplicate'
  | 'quarantine'
  | 'suppress'
  | 'reject';

export const MONTREAL_PUBLISHED_SEGMENT = 'agency-ca-qc-montreal-published-2026-08';
export const QUEBEC_OTHER_PUBLISHED_SEGMENT = 'agency-ca-qc-other-published-2026-08';
export const UNVERIFIED_QUARANTINE_SEGMENT = 'agency-unverified-quarantine';
/**
 * Published contacts outside the approved Quebec geography. They are retained as evidence with
 * `rejected` eligibility rather than dropped: the founder may widen the ICP later, and silently
 * discarding 243 real published contacts would destroy sourcing work. `rejected` keeps them
 * unselectable until that decision is explicit.
 */
export const OUT_OF_SCOPE_PUBLISHED_SEGMENT = 'agency-ca-out-of-scope-published-2026-08';

export interface ContactSuppressionEvidence {
  /** Emails with a withdrawn consent record. Consent belongs to the address, not to a (email,url) pair. */
  readonly unsubscribedEmails: ReadonlySet<string>;
  /** Emails with an active/trialing subscription — customers never receive acquisition mail. */
  readonly convertedEmails: ReadonlySet<string>;
  /** Explicit operator or legal/policy suppression. */
  readonly operatorSuppressedEmails?: ReadonlySet<string>;
}

export interface ExistingContactState {
  readonly id: string;
  readonly email: string;
  readonly segment: string;
  readonly sourceClass: ContactSourceClass;
  readonly eligibilityStatus: ContactEligibility;
  readonly eligibilityReason: string | null;
  readonly addedToSequenceAt: string | null;
}

export interface ContactWrite {
  readonly email: string;
  readonly name: string | null;
  readonly company: string | null;
  readonly companyDomain: string;
  readonly url: string;
  readonly segment: string;
  readonly tags: readonly string[];
  readonly city: string | null;
  readonly region: string | null;
  readonly contactTitle: string | null;
  readonly source: string;
  readonly sourceClass: ContactSourceClass;
  readonly sourceFile: string;
  readonly sourceFileSha256: string;
  readonly sourceRowNumber: number;
  readonly eligibilityStatus: ContactEligibility;
  readonly eligibilityReason: string;
  readonly provenance: Readonly<Record<string, unknown>>;
}

export interface PlannedContact {
  readonly email: string;
  readonly decision: IntakeDecision;
  readonly reason: string;
  readonly sourceFile: string;
  readonly sourceRowNumber: number;
  /** null when the row must not reach the contact bank at all (malformed or evidence-only). */
  readonly write: ContactWrite | null;
}

export interface IntakeCounts {
  readonly inserted: number;
  readonly merged: number;
  readonly duplicate: number;
  readonly quarantined: number;
  readonly suppressed: number;
  readonly rejected: number;
}

export interface IntakePlan {
  readonly planned: readonly PlannedContact[];
  readonly counts: IntakeCounts;
  /** Rows that never become contacts: malformed input and evidence-only files. */
  readonly malformed: readonly { readonly sourceFile: string; readonly row: number; readonly reason: string }[];
  readonly evidenceOnly: readonly { readonly sourceFile: string; readonly rows: number; readonly reason: string }[];
  readonly segmentCounts: Readonly<Record<string, number>>;
  readonly eligibilityCounts: Readonly<Record<ContactEligibility, number>>;
}

export interface IntakeSourceFile {
  readonly path: string;
  /** Basename recorded on every row so provenance survives a moved directory. */
  readonly name: string;
  readonly sha256: string;
  readonly text: string;
  readonly sourceClass: ContactSourceClass;
}

// ── Parsing ─────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Role-based mailboxes reach a function, not a person. Published or not, they are not a
 * decision-maker with implied consent for this offer, so they stay unsendable.
 */
const ROLE_LOCAL_PARTS = new Set([
  'info', 'contact', 'hello', 'bonjour', 'admin', 'office', 'sales', 'support', 'help',
  'team', 'marketing', 'agency', 'studio', 'general', 'inquiries', 'enquiries', 'mail',
  'newbusiness', 'projects', 'service', 'services', 'no-reply', 'noreply', 'accounts',
]);

/** A personal free-mail address is not the company mailbox the bundle claims to have found. */
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.ca', 'hotmail.fr', 'outlook.com',
  'outlook.fr', 'live.com', 'live.ca', 'yahoo.com', 'yahoo.ca', 'ymail.com', 'aol.com',
  'icloud.com', 'me.com', 'protonmail.com', 'proton.me', 'videotron.ca', 'sympatico.ca',
  'bell.net', 'globetrotter.net',
]);

const MONTREAL_REGIONS = new Set(['montreal', 'montréal', 'mtl', 'laval', 'longueuil']);
const QUEBEC_OTHER_REGIONS = new Set(['quebec', 'québec', 'quebec city', 'québec city', 'gatineau', 'sherbrooke', 'trois-rivieres', 'trois-rivières', 'saguenay', 'levis', 'lévis']);

/**
 * RFC4180-style parse. The bundle's `basis` column contains commas inside quotes
 * ("domain confirmed; first@ pattern (62%)"), so a naive split silently shifts every later
 * column — which is exactly how a Toronto row would masquerade as a Montreal one.
 */
export function parseCsv(text: string): { header: string[]; rows: { row: number; values: string[] }[] } {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  const pushField = () => { record.push(field); field = ''; };
  const pushRecord = () => { pushField(); records.push(record); record = []; };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += char;
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === ',') { pushField(); continue; }
    if (char === '\r') continue;
    if (char === '\n') { pushRecord(); continue; }
    field += char;
  }
  if (field.length > 0 || record.length > 0) pushRecord();

  const nonEmpty = records.filter((values) => values.some((value) => value.trim().length > 0));
  const header = (nonEmpty[0] ?? []).map((value) => value.trim().toLowerCase());
  return {
    header,
    // +2: one for the header row, one because operators count rows from 1.
    rows: nonEmpty.slice(1).map((values, index) => ({ row: index + 2, values })),
  };
}

function cell(header: readonly string[], values: readonly string[], ...names: string[]): string {
  for (const name of names) {
    const index = header.indexOf(name);
    if (index >= 0) return (values[index] ?? '').trim();
  }
  return '';
}

// ── Normalization and classification (pure) ─────────────────────────────────────

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

export function emailDomain(email: string): string {
  return email.slice(email.indexOf('@') + 1).toLowerCase();
}

export function isRoleBasedEmail(email: string): boolean {
  const local = email.slice(0, email.indexOf('@')).toLowerCase();
  return ROLE_LOCAL_PARTS.has(local) || ROLE_LOCAL_PARTS.has(local.replace(/[._-]/g, ''));
}

export function isFreeMailDomain(email: string): boolean {
  return FREE_MAIL_DOMAINS.has(emailDomain(email));
}

export type RegionScope = 'qc_montreal' | 'qc_other' | 'out_of_scope';

export function classifyRegion(raw: string | null): RegionScope {
  const region = (raw ?? '').trim().toLowerCase();
  if (MONTREAL_REGIONS.has(region)) return 'qc_montreal';
  if (QUEBEC_OTHER_REGIONS.has(region)) return 'qc_other';
  return 'out_of_scope';
}

export function segmentFor(sourceClass: ContactSourceClass, region: string | null): string {
  if (sourceClass === 'constructed_unverified') return UNVERIFIED_QUARANTINE_SEGMENT;
  const scope = classifyRegion(region);
  if (scope === 'qc_montreal') return MONTREAL_PUBLISHED_SEGMENT;
  if (scope === 'qc_other') return QUEBEC_OTHER_PUBLISHED_SEGMENT;
  return OUT_OF_SCOPE_PUBLISHED_SEGMENT;
}

/**
 * Fail-closed eligibility, most restrictive rule first. Order matters: a constructed address in
 * Montreal must read as "quarantined", not "in geography", and a suppressed address must read as
 * suppressed no matter how good its provenance is.
 */
export function classifyEligibility(args: {
  readonly email: string;
  readonly sourceClass: ContactSourceClass;
  readonly region: string | null;
  readonly suppression: ContactSuppressionEvidence;
}): { readonly status: ContactEligibility; readonly reason: string } {
  const { email, sourceClass, region, suppression } = args;

  if (suppression.unsubscribedEmails.has(email)) {
    return { status: 'suppressed', reason: 'unsubscribed' };
  }
  if (suppression.convertedEmails.has(email)) {
    return { status: 'converted', reason: 'active_or_trialing_subscription' };
  }
  if (suppression.operatorSuppressedEmails?.has(email)) {
    return { status: 'suppressed', reason: 'operator_or_policy_suppression' };
  }
  if (sourceClass === 'constructed_unverified') {
    return { status: 'needs_verification', reason: 'constructed_address_no_consent_basis' };
  }
  if (sourceClass === 'rejection_evidence') {
    return { status: 'rejected', reason: 'rejection_evidence_never_sendable' };
  }
  if (isRoleBasedEmail(email)) {
    return { status: 'needs_verification', reason: 'role_based_address' };
  }
  if (isFreeMailDomain(email)) {
    return { status: 'needs_verification', reason: 'free_mail_domain' };
  }
  if (classifyRegion(region) === 'out_of_scope') {
    return {
      status: 'rejected',
      reason: `outside_approved_geography:${(region ?? 'unknown').trim().toLowerCase() || 'unknown'}`,
    };
  }
  return { status: 'eligible', reason: 'published_address_in_approved_geography' };
}

/**
 * Terminal states record a decision about the PERSON (consent withdrawn, already a customer,
 * locked into an audience, ruled out of the ICP). No amount of better provenance may reopen them
 * through an import. Everything else is a statement about the current EVIDENCE, so it moves when
 * the evidence improves.
 */
const TERMINAL_ELIGIBILITY = new Set<ContactEligibility>(['suppressed', 'converted', 'rejected', 'enrolled']);

const SOURCE_CLASS_RANK: Record<ContactSourceClass, number> = {
  verified_published: 0,
  operator_manual: 1,
  constructed_unverified: 2,
  rejection_evidence: 3,
};

/**
 * Never erase stronger existing evidence (ECP-1 acceptance). "Stronger" means both directions:
 * a better provenance class wins, and a more restrictive eligibility wins. Re-importing the
 * constructed file can therefore never loosen a contact the verified file already established,
 * and re-importing the verified file can never resurrect an unsubscribed address.
 */
export function mergeContactEvidence(
  existing: ExistingContactState,
  incoming: { readonly sourceClass: ContactSourceClass; readonly eligibilityStatus: ContactEligibility; readonly eligibilityReason: string; readonly segment: string },
): { readonly sourceClass: ContactSourceClass; readonly eligibilityStatus: ContactEligibility; readonly eligibilityReason: string; readonly segment: string } {
  const existingSourceWins = SOURCE_CLASS_RANK[existing.sourceClass] < SOURCE_CLASS_RANK[incoming.sourceClass];
  const strongerSource = existingSourceWins ? existing.sourceClass : incoming.sourceClass;

  // Most restrictive first: live suppression evidence outranks provenance in either direction,
  // then an existing terminal decision, then the verdict of the weaker source is discarded.
  const keepExistingEligibility = TERMINAL_ELIGIBILITY.has(incoming.eligibilityStatus)
    ? false
    : TERMINAL_ELIGIBILITY.has(existing.eligibilityStatus) || existingSourceWins;

  return {
    sourceClass: strongerSource,
    eligibilityStatus: keepExistingEligibility ? existing.eligibilityStatus : incoming.eligibilityStatus,
    eligibilityReason: keepExistingEligibility
      ? existing.eligibilityReason ?? existing.eligibilityStatus
      : incoming.eligibilityReason,
    // A contact keeps the segment of its strongest provenance: the constructed file must not be
    // able to drag a published contact into quarantine.
    segment: existingSourceWins ? existing.segment : incoming.segment,
  };
}

function decisionFor(
  eligibility: ContactEligibility,
  existing: ExistingContactState | undefined,
  unchanged: boolean,
): IntakeDecision {
  if (existing) return unchanged ? 'duplicate' : 'merge';
  if (eligibility === 'eligible') return 'insert';
  if (eligibility === 'needs_verification') return 'quarantine';
  if (eligibility === 'suppressed' || eligibility === 'converted') return 'suppress';
  return 'reject';
}

// ── Planning (the dry run) ──────────────────────────────────────────────────────

export function planContactIntake(args: {
  readonly files: readonly IntakeSourceFile[];
  readonly existing: readonly ExistingContactState[];
  readonly suppression: ContactSuppressionEvidence;
}): IntakePlan {
  const existingByEmail = new Map(args.existing.map((row) => [row.email.toLowerCase(), row]));
  const planned: PlannedContact[] = [];
  const malformed: { sourceFile: string; row: number; reason: string }[] = [];
  const evidenceOnly: { sourceFile: string; rows: number; reason: string }[] = [];
  const seenInRun = new Map<string, ContactSourceClass>();

  for (const file of args.files) {
    const { header, rows } = parseCsv(file.text);

    // Evidence-only files (no address column, or an explicitly superseded export) are counted
    // and hashed but never written. There is nothing here that could become sendable.
    const emailColumn = ['email', 'constructed_email', 'published_email_on_site', 'individual_email_found']
      .find((name) => header.includes(name));
    if (file.sourceClass === 'rejection_evidence' || !emailColumn) {
      evidenceOnly.push({
        sourceFile: file.name,
        rows: rows.length,
        reason: file.sourceClass === 'rejection_evidence'
          ? 'rejection_or_superseded_evidence_not_importable'
          : 'no_email_column',
      });
      continue;
    }

    for (const { row, values } of rows) {
      const rawEmail = cell(header, values, emailColumn);
      const email = normalizeEmail(rawEmail);
      if (!email) {
        malformed.push({ sourceFile: file.name, row, reason: rawEmail ? 'invalid_email' : 'missing_email' });
        continue;
      }

      const company = cell(header, values, 'company') || null;
      if (!company) {
        malformed.push({ sourceFile: file.name, row, reason: 'missing_company' });
        continue;
      }

      const region = cell(header, values, 'region') || null;
      const previousInRun = seenInRun.get(email);
      if (previousInRun !== undefined) {
        // Same address twice inside one run: the stronger provenance already planned a write.
        const strongerAlreadyPlanned = SOURCE_CLASS_RANK[previousInRun] <= SOURCE_CLASS_RANK[file.sourceClass];
        if (strongerAlreadyPlanned) {
          planned.push({
            email,
            decision: 'duplicate',
            reason: `already_seen_in_run:${previousInRun}`,
            sourceFile: file.name,
            sourceRowNumber: row,
            write: null,
          });
          continue;
        }
      }

      const classified = classifyEligibility({ email, sourceClass: file.sourceClass, region, suppression: args.suppression });
      const segment = segmentFor(file.sourceClass, region);
      const existing = existingByEmail.get(email);
      const resolved = existing
        ? mergeContactEvidence(existing, {
            sourceClass: file.sourceClass,
            eligibilityStatus: classified.status,
            eligibilityReason: classified.reason,
            segment,
          })
        : { sourceClass: file.sourceClass, eligibilityStatus: classified.status, eligibilityReason: classified.reason, segment };

      const unchanged = Boolean(
        existing &&
          existing.sourceClass === resolved.sourceClass &&
          existing.eligibilityStatus === resolved.eligibilityStatus &&
          existing.eligibilityReason === resolved.eligibilityReason &&
          existing.segment === resolved.segment,
      );

      const domain = emailDomain(email);
      const write: ContactWrite = {
        email,
        name: cell(header, values, 'name', 'owner_name') || null,
        company,
        companyDomain: domain,
        // Derived from the address, not invented: the bundle carries no website column, and
        // guessing one would be indistinguishable from evidence.
        url: `https://${domain}`,
        segment: resolved.segment,
        tags: ['agency', `source:${file.sourceClass}`],
        city: region,
        region,
        contactTitle: cell(header, values, 'title') || null,
        source: 'agency-outreach-bundle-2026-08',
        sourceClass: resolved.sourceClass,
        sourceFile: file.name,
        sourceFileSha256: file.sha256,
        sourceRowNumber: row,
        eligibilityStatus: resolved.eligibilityStatus,
        eligibilityReason: resolved.eligibilityReason,
        provenance: {
          source_file: file.name,
          source_file_sha256: file.sha256,
          source_row: row,
          source_class: file.sourceClass,
          url_basis: 'derived_from_email_domain',
          published_means_public_source_not_deliverability: file.sourceClass === 'verified_published',
          ...(cell(header, values, 'confidence') ? { construction_confidence: cell(header, values, 'confidence') } : {}),
          ...(cell(header, values, 'basis') ? { construction_basis: cell(header, values, 'basis') } : {}),
        },
      };

      seenInRun.set(email, resolved.sourceClass);
      planned.push({
        email,
        decision: decisionFor(resolved.eligibilityStatus, existing, unchanged),
        reason: resolved.eligibilityReason,
        sourceFile: file.name,
        sourceRowNumber: row,
        write: unchanged ? null : write,
      });
    }
  }

  const counts: IntakeCounts = {
    inserted: planned.filter((item) => item.decision === 'insert').length,
    merged: planned.filter((item) => item.decision === 'merge').length,
    duplicate: planned.filter((item) => item.decision === 'duplicate').length,
    quarantined: planned.filter((item) => item.decision === 'quarantine').length,
    suppressed: planned.filter((item) => item.decision === 'suppress').length,
    rejected: planned.filter((item) => item.decision === 'reject').length + malformed.length,
  };

  const segmentCounts: Record<string, number> = {};
  const eligibilityCounts: Record<ContactEligibility, number> = {
    eligible: 0, needs_verification: 0, suppressed: 0, rejected: 0, enrolled: 0, converted: 0,
  };
  for (const item of planned) {
    if (!item.write) continue;
    segmentCounts[item.write.segment] = (segmentCounts[item.write.segment] ?? 0) + 1;
    eligibilityCounts[item.write.eligibilityStatus] += 1;
  }

  return { planned, counts, malformed, evidenceOnly, segmentCounts, eligibilityCounts };
}

// ── Apply ───────────────────────────────────────────────────────────────────────

/**
 * Load the suppression/conversion evidence the plan needs. Read-only, and paginated: a partial
 * read here would let a previously unsubscribed address come back as eligible.
 */
export async function loadSuppressionEvidence(supabase: SupabaseClient): Promise<ContactSuppressionEvidence> {
  const unsubscribedEmails = new Set<string>();
  const convertedEmails = new Set<string>();

  const prospects = await fetchAllRows<{ email: string; unsubscribed_at: string | null; lifecycle_status: string | null }>(
    () => supabase.from('outreach_prospects').select('email,unsubscribed_at,lifecycle_status'),
    'outreach_prospects suppression evidence',
  );
  for (const row of prospects) {
    const email = row.email.toLowerCase();
    if (row.unsubscribed_at) unsubscribedEmails.add(email);
    if (row.lifecycle_status === 'converted') convertedEmails.add(email);
  }

  const subscriptions = await fetchAllRows<{ email: string }>(
    () => supabase.from('monitoring_subscriptions').select('email,status').in('status', ['active', 'trialing']),
    'monitoring_subscriptions conversion evidence',
  );
  for (const row of subscriptions) {
    convertedEmails.add(row.email.toLowerCase());
  }

  return { unsubscribedEmails, convertedEmails };
}

export async function loadExistingContacts(supabase: SupabaseClient): Promise<ExistingContactState[]> {
  const data = await fetchAllRows<Record<string, unknown>>(
    () => supabase
      .from('outreach_contacts')
      .select('id,email,segment,source_class,eligibility_status,eligibility_reason,added_to_sequence_at'),
    'outreach_contacts',
  );
  return data.map((row) => ({
    id: String(row.id),
    email: String(row.email).toLowerCase(),
    segment: String(row.segment ?? ''),
    sourceClass: (row.source_class as ContactSourceClass) ?? 'operator_manual',
    eligibilityStatus: (row.eligibility_status as ContactEligibility) ?? 'needs_verification',
    eligibilityReason: (row.eligibility_reason as string | null) ?? null,
    addedToSequenceAt: (row.added_to_sequence_at as string | null) ?? null,
  }));
}

/**
 * Write exactly the plan's contact-bank state. Never touches prospects, never sends mail: the
 * only path from bank → sequence stays the explicit campaign enrollment in ECP-3.
 */
export async function applyContactIntake(
  supabase: SupabaseClient,
  plan: IntakePlan,
  nowIso = new Date().toISOString(),
): Promise<{ written: number; failed: number; errors: string[] }> {
  const writes = plan.planned.map((item) => item.write).filter((write): write is ContactWrite => write !== null);
  const errors: string[] = [];
  let written = 0;

  for (let index = 0; index < writes.length; index += 200) {
    const batch = writes.slice(index, index + 200).map((write) => ({
      email: write.email,
      name: write.name,
      company: write.company,
      company_domain: write.companyDomain,
      url: write.url,
      segment: write.segment,
      tags: write.tags,
      city: write.city,
      region: write.region,
      contact_title: write.contactTitle,
      source: write.source,
      source_class: write.sourceClass,
      source_file: write.sourceFile,
      source_file_sha256: write.sourceFileSha256,
      source_row_number: write.sourceRowNumber,
      eligibility_status: write.eligibilityStatus,
      eligibility_reason: write.eligibilityReason,
      eligibility_checked_at: nowIso,
      provenance: write.provenance,
      updated_at: nowIso,
    }));
    const { error } = await supabase.from('outreach_contacts').upsert(batch, { onConflict: 'email' });
    if (error) errors.push(`rows ${String(index)}-${String(index + batch.length)}: ${error.message}`);
    else written += batch.length;
  }

  return { written, failed: writes.length - written, errors };
}
