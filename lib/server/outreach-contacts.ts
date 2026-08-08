/**
 * Outreach contact bank (issue #135) — Brevo-style saved segments.
 *
 * Contacts are SAVED, never emailed: the bank holds companies + point-of-contact emails,
 * tagged by segment, until the operator adds a whole segment to the sequence with one
 * click. That add is the only path from bank → prospects, it staggers first-sends one
 * per hour (free-plan cron pacing), and it re-checks the email-keyed unsubscribe guard
 * at that moment — a contact who unsubscribed as a prospect can never be resurrected
 * through the bank.
 *
 * Degrades to a dormant panel until migration 057 is applied (operator-run, as always).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isFreeMailDomain,
  isRoleBasedEmail,
  normalizeEmail,
  parseCsv,
  type ContactEligibility,
} from './agency-contact-intake';
import { normalizeProspectUrl } from './outreach-import';
import { normalizeOutreachCadence, type OutreachCadence } from './outreach';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_ROWS = 500;

export interface ContactRow {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly company: string | null;
  readonly url: string;
  readonly segment: string;
  readonly tags: string[];
  readonly city: string | null;
  readonly source: string | null;
  readonly personalization_reason: string | null;
  readonly personalization_source_url: string | null;
  readonly personalization_verified_at: string | null;
  readonly added_to_sequence_at: string | null;
  readonly eligibility_status: string;
  readonly created_at: string;
}

export interface ParsedContact {
  email: string;
  url: string;
  name: string | null;
  company: string | null;
  city: string | null;
  personalizationReason?: string | null;
  personalizationSourceUrl?: string | null;
  contactTitle?: string | null;
  region?: string | null;
  provenance?: Readonly<Record<string, unknown>>;
}

export interface ContactParseResult {
  rows: ParsedContact[];
  invalid: { line: number; text: string; reason: string }[];
}

export const APOLLO_MSP_TARGET_SEGMENT = 'msp-qc';

export interface ApolloPromotionEvidence {
  readonly unsubscribedEmails: ReadonlySet<string>;
  readonly convertedEmails: ReadonlySet<string>;
  readonly suppressedEmails: ReadonlySet<string>;
}

export interface ApolloPromotionContact {
  readonly id: string;
  readonly email: string;
  readonly segment: string;
  readonly tags: readonly string[];
  readonly eligibilityStatus: ContactEligibility;
  readonly provenance: Readonly<Record<string, unknown>>;
}

export interface ApolloPromotionDecision {
  readonly status: ContactEligibility;
  readonly reason: string;
  readonly targetSegment: string | null;
}

export interface ApolloPromotionUpdate {
  readonly id: string;
  readonly email: string;
  readonly previousStatus: ContactEligibility;
  readonly status: ContactEligibility;
  readonly reason: string;
  readonly segment: string;
  readonly tags: readonly string[];
  readonly provenance: Readonly<Record<string, unknown>>;
}

export interface ApolloPromotionPlan {
  readonly updates: readonly ApolloPromotionUpdate[];
  readonly counts: {
    readonly sourceRows: number;
    readonly providerVerified: number;
    readonly eligibleMsp: number;
    readonly held: number;
    readonly suppressed: number;
    readonly converted: number;
    readonly terminalPreserved: number;
    readonly missingContact: number;
  };
  readonly reasons: Readonly<Record<string, number>>;
}

const TERMINAL_ELIGIBILITY = new Set<ContactEligibility>(['suppressed', 'converted', 'rejected', 'enrolled']);
const MSP_DECISION_MAKER_RE = /\b(owner|founder|co-?founder|president|chief executive|ceo|managing (?:director|partner)|principal)\b/i;
const MSP_INDUSTRY_RE = /(information technology|it services|computer (?:&|and) network security|computer networking)/i;
const MSP_SERVICE_RE = /\b(managed it|managed service provider|it support services|outsourced it|co-managed it|help ?desk services|managed network|managed cybersecurity)\b/i;

function provenanceText(row: ParsedContact, key: string): string {
  const value = row.provenance?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function businessIdentityMatches(row: ParsedContact): boolean {
  try {
    const emailHost = row.email.slice(row.email.indexOf('@') + 1).toLowerCase();
    const siteHost = new URL(row.url).hostname.replace(/^www\./, '').toLowerCase();
    if (emailHost === siteHost || emailHost.endsWith(`.${siteHost}`) || siteHost.endsWith(`.${emailHost}`)) return true;
    return emailHost.split('.')[0] === siteHost.split('.')[0];
  } catch {
    return false;
  }
}

/**
 * Provider verification proves mailbox quality, not that a company belongs in the primary MSP
 * cohort. This deterministic gate promotes only named Quebec MSP decision-makers whose Apollo
 * record carries explicit managed-services evidence. Everything ambiguous remains saved and held.
 */
export function classifyApolloMspContact(
  row: ParsedContact,
  evidence: ApolloPromotionEvidence,
): ApolloPromotionDecision {
  const email = row.email.toLowerCase();
  if (evidence.unsubscribedEmails.has(email) || evidence.suppressedEmails.has(email)) {
    return { status: 'suppressed', reason: 'suppression_ledger_match', targetSegment: null };
  }
  if (evidence.convertedEmails.has(email)) {
    return { status: 'converted', reason: 'active_or_trialing_customer', targetSegment: null };
  }
  if (provenanceText(row, 'provider') !== 'apollo') {
    return { status: 'needs_verification', reason: 'apollo_provider_missing', targetSegment: null };
  }
  if (provenanceText(row, 'provider_email_status').toLowerCase() !== 'verified') {
    return { status: 'needs_verification', reason: 'apollo_email_not_verified', targetSegment: null };
  }
  if (provenanceText(row, 'provider_catch_all_status').toLowerCase() === 'catch-all') {
    return { status: 'needs_verification', reason: 'apollo_catch_all_mailbox', targetSegment: null };
  }
  if (!row.name || !row.company || !row.contactTitle || !row.url) {
    return { status: 'needs_verification', reason: 'business_identity_incomplete', targetSegment: null };
  }
  if (isRoleBasedEmail(email)) {
    return { status: 'needs_verification', reason: 'role_based_address', targetSegment: null };
  }
  if (isFreeMailDomain(email) || !businessIdentityMatches(row)) {
    return { status: 'needs_verification', reason: 'business_domain_not_confirmed', targetSegment: null };
  }
  if (!MSP_DECISION_MAKER_RE.test(row.contactTitle)) {
    return { status: 'needs_verification', reason: 'not_msp_decision_maker', targetSegment: null };
  }

  const companyCountry = provenanceText(row, 'company_country');
  const companyState = provenanceText(row, 'company_state');
  if (companyCountry.toLowerCase() !== 'canada' || !/^(quebec|québec)$/i.test(companyState)) {
    return { status: 'needs_verification', reason: 'outside_primary_quebec_geography', targetSegment: null };
  }
  const industry = provenanceText(row, 'industry');
  const keywords = provenanceText(row, 'keywords');
  if (!MSP_INDUSTRY_RE.test(industry) || !MSP_SERVICE_RE.test(`${industry} ${keywords}`)) {
    return { status: 'needs_verification', reason: 'not_msp_fit', targetSegment: null };
  }
  return {
    status: 'eligible',
    reason: 'apollo_verified_quebec_msp_decision_maker',
    targetSegment: APOLLO_MSP_TARGET_SEGMENT,
  };
}

/** Normalize a segment key: "Marketing Agencies QC" → "marketing-agencies-qc". */
export function normalizeSegment(raw: string): string | null {
  const seg = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return seg.length >= 2 && seg.length <= 48 ? seg : null;
}

/**
 * Line shapes (comma/semicolon/tab separated), mirroring the prospect importer:
 *   email, url
 *   email, url, name
 *   email, url, name, company
 *   email, url, name, company, city, personalization reason, https source URL
 * Header rows containing "email", blank lines and #comments are skipped.
 */
export function parseContactImport(text: string): ContactParseResult {
  const result: ContactParseResult = { rows: [], invalid: [] };
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = (lines[i] ?? '').trim();
    if (!raw || raw.startsWith('#')) continue;
    const parts = raw.split(/[,;\t]/).map((p) => p.trim());
    const email = (parts[0] ?? '').toLowerCase();
    if (i === 0 && /email/i.test(email) && !EMAIL_RE.test(email)) continue;
    if (!EMAIL_RE.test(email)) {
      result.invalid.push({ line: i + 1, text: raw.slice(0, 120), reason: 'invalid email' });
      continue;
    }
    const url = normalizeProspectUrl(parts[1] ?? '');
    if (!url) {
      result.invalid.push({ line: i + 1, text: raw.slice(0, 120), reason: 'invalid url' });
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    const personalizationReason = (parts[5] ?? '').slice(0, 300) || null;
    const sourceCandidate = parts[6] ?? '';
    let personalizationSourceUrl = null;
    if (sourceCandidate) {
      try {
        const parsedSource = new URL(sourceCandidate);
        if (parsedSource.protocol !== 'https:') throw new Error('source must use https');
        personalizationSourceUrl = parsedSource.toString();
      } catch {
        result.invalid.push({
          line: i + 1,
          text: raw.slice(0, 120),
          reason: 'invalid personalization source url',
        });
        continue;
      }
    }
    result.rows.push({
      email,
      url,
      name: parts[2] || null,
      company: parts[3] || null,
      city: parts[4] || null,
      personalizationReason,
      personalizationSourceUrl,
    });
    if (result.rows.length >= MAX_ROWS) break;
  }
  return result;
}

function csvCell(header: readonly string[], values: readonly string[], ...names: string[]): string {
  for (const name of names) {
    const index = header.indexOf(name);
    if (index >= 0) return (values[index] ?? '').trim();
  }
  return '';
}

/**
 * Parse a provider CSV into held contact-bank rows. Apollo exports are intentionally treated as
 * sourcing evidence, not consent or send eligibility: every new row remains
 * `needs_verification` when it is written.
 */
export function parseContactCsvImport(text: string): ContactParseResult {
  const result: ContactParseResult = { rows: [], invalid: [] };
  const { header, rows } = parseCsv(text);
  const seen = new Set<string>();

  for (const sourceRow of rows) {
    const email = normalizeEmail(csvCell(header, sourceRow.values, 'email', 'email address'));
    if (!email) {
      result.invalid.push({ line: sourceRow.row, text: '', reason: 'missing or invalid email' });
      continue;
    }
    if (seen.has(email)) continue;

    const url = normalizeProspectUrl(csvCell(header, sourceRow.values, 'website', 'url', 'company website'));
    if (!url) {
      result.invalid.push({ line: sourceRow.row, text: email, reason: 'missing or invalid website' });
      continue;
    }
    seen.add(email);

    const firstName = csvCell(header, sourceRow.values, 'first name', 'firstname');
    const lastName = csvCell(header, sourceRow.values, 'last name', 'lastname');
    const name = [firstName, lastName].filter(Boolean).join(' ') || csvCell(header, sourceRow.values, 'name');
    const city = csvCell(header, sourceRow.values, 'city', 'company city');
    const state = csvCell(header, sourceRow.values, 'state', 'company state');
    const country = csvCell(header, sourceRow.values, 'country', 'company country');
    const personLinkedinUrl = csvCell(header, sourceRow.values, 'person linkedin url', 'linkedin url');

    result.rows.push({
      email,
      url,
      name: name || null,
      company: csvCell(header, sourceRow.values, 'company name', 'company') || null,
      city: city || null,
      contactTitle: csvCell(header, sourceRow.values, 'title', 'job title') || null,
      region: [city, state, country].filter(Boolean).join(', ') || null,
      provenance: {
        provider: 'apollo',
        provider_email_status: csvCell(header, sourceRow.values, 'email status') || null,
        provider_catch_all_status: csvCell(header, sourceRow.values, 'primary email catch-all status') || null,
        provider_email_source: csvCell(header, sourceRow.values, 'primary email source') || null,
        provider_email_last_verified_at: csvCell(header, sourceRow.values, 'primary email last verified at') || null,
        provider_contact_id: csvCell(header, sourceRow.values, 'apollo contact id', 'apollo record id') || null,
        person_linkedin_url: personLinkedinUrl || null,
        company_linkedin_url: csvCell(header, sourceRow.values, 'company linkedin url') || null,
        company_country: csvCell(header, sourceRow.values, 'company country') || country || null,
        company_state: csvCell(header, sourceRow.values, 'company state') || state || null,
        industry: csvCell(header, sourceRow.values, 'industry') || null,
        keywords: csvCell(header, sourceRow.values, 'keywords') || null,
        employee_count: csvCell(header, sourceRow.values, '# employees') || null,
        source_row: sourceRow.row,
      },
    });
    if (result.rows.length >= MAX_ROWS) break;
  }
  return result;
}

export async function contactsTableExists(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { error } = await supabase.from('outreach_contacts').select('id', { head: true, count: 'exact' }).limit(1);
    return !error;
  } catch {
    return false;
  }
}

export async function importContacts(
  supabase: SupabaseClient,
  rows: ParsedContact[],
  meta: { segment: string; tags?: string[]; source?: string; sourceFile?: string; sourceFileSha256?: string }
): Promise<{ imported: number; skippedExisting: number; error?: string }> {
  if (rows.length === 0) return { imported: 0, skippedExisting: 0 };
  const emails = rows.map((row) => row.email);
  const existing = new Set<string>();
  for (let start = 0; start < emails.length; start += 150) {
    const { data: existingRows, error: existingError } = await supabase
      .from('outreach_contacts')
      .select('email')
      .in('email', emails.slice(start, start + 150));
    if (existingError) return { imported: 0, skippedExisting: 0, error: existingError.message };
    for (const row of (existingRows ?? []) as { email: string }[]) existing.add(row.email.toLowerCase());
  }
  const newRows = rows.filter((row) => !existing.has(row.email.toLowerCase()));
  if (newRows.length === 0) return { imported: 0, skippedExisting: rows.length };

  const nowIso = new Date().toISOString();
  const payload = newRows.map((r, index) => ({
    email: r.email,
    url: r.url,
    name: r.name,
    company: r.company,
    city: r.city,
    segment: meta.segment,
    tags: meta.tags ?? [],
    source: meta.source ?? 'manual',
    source_class: 'operator_manual',
    source_file: meta.sourceFile ?? null,
    source_file_sha256: meta.sourceFileSha256 ?? null,
    source_row_number: Number(r.provenance?.source_row ?? index + 2),
    company_domain: new URL(r.url).hostname.replace(/^www\./, '').toLowerCase(),
    region: r.region ?? r.city,
    contact_title: r.contactTitle ?? null,
    eligibility_status: 'needs_verification',
    eligibility_reason: 'founder_authorized_import_requires_verification',
    eligibility_checked_at: nowIso,
    provenance: r.provenance ?? {},
    personalization_reason: r.personalizationReason ?? null,
    personalization_source_url: r.personalizationSourceUrl ?? null,
    personalization_verified_at:
      r.personalizationReason && r.personalizationSourceUrl ? new Date().toISOString() : null,
    updated_at: nowIso,
  }));
  const { data: inserted, error } = await supabase
    .from('outreach_contacts')
    .upsert(payload, { onConflict: 'email', ignoreDuplicates: true })
    .select('email');
  if (error) return { imported: 0, skippedExisting: existing.size, error: error.message };
  const imported = (inserted ?? []).length;
  return { imported, skippedExisting: rows.length - imported };
}

export async function loadApolloPromotionContacts(
  supabase: SupabaseClient,
  emails: readonly string[],
): Promise<ApolloPromotionContact[]> {
  const contacts: ApolloPromotionContact[] = [];
  for (let start = 0; start < emails.length; start += 150) {
    const { data, error } = await supabase
      .from('outreach_contacts')
      .select('id,email,segment,tags,eligibility_status,provenance')
      .in('email', emails.slice(start, start + 150));
    if (error) throw new Error(`apollo promotion contact read failed: ${error.message}`);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      contacts.push({
        id: String(row.id),
        email: String(row.email).toLowerCase(),
        segment: String(row.segment ?? ''),
        tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
        eligibilityStatus: (row.eligibility_status as ContactEligibility) ?? 'needs_verification',
        provenance: row.provenance && typeof row.provenance === 'object'
          ? row.provenance as Record<string, unknown>
          : {},
      });
    }
  }
  return contacts;
}

/** Pure preview: the exact records and reasons a production promotion would write. */
export function planApolloMspPromotion(args: {
  readonly rows: readonly ParsedContact[];
  readonly contacts: readonly ApolloPromotionContact[];
  readonly evidence: ApolloPromotionEvidence;
}): ApolloPromotionPlan {
  const existingByEmail = new Map(args.contacts.map((contact) => [contact.email.toLowerCase(), contact]));
  const updates: ApolloPromotionUpdate[] = [];
  const reasons: Record<string, number> = {};
  let providerVerified = 0;
  let eligibleMsp = 0;
  let held = 0;
  let suppressed = 0;
  let converted = 0;
  let terminalPreserved = 0;
  let missingContact = 0;

  for (const row of args.rows) {
    if (provenanceText(row, 'provider_email_status').toLowerCase() === 'verified') providerVerified += 1;
    const existing = existingByEmail.get(row.email.toLowerCase());
    if (!existing) {
      missingContact += 1;
      reasons.contact_not_in_bank = (reasons.contact_not_in_bank ?? 0) + 1;
      continue;
    }
    if (TERMINAL_ELIGIBILITY.has(existing.eligibilityStatus)) {
      terminalPreserved += 1;
      const reason = `terminal_preserved:${existing.eligibilityStatus}`;
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      continue;
    }

    const decision = classifyApolloMspContact(row, args.evidence);
    reasons[decision.reason] = (reasons[decision.reason] ?? 0) + 1;
    if (decision.status === 'eligible') eligibleMsp += 1;
    else if (decision.status === 'suppressed') suppressed += 1;
    else if (decision.status === 'converted') converted += 1;
    else held += 1;

    const tags = [...new Set([
      ...existing.tags,
      'apollo',
      ...(decision.status === 'eligible' ? ['apollo-verified', 'msp-fit'] : []),
    ])].slice(0, 12);
    updates.push({
      id: existing.id,
      email: existing.email,
      previousStatus: existing.eligibilityStatus,
      status: decision.status,
      reason: decision.reason,
      segment: decision.targetSegment ?? existing.segment,
      tags,
      provenance: { ...existing.provenance, ...(row.provenance ?? {}), msp_eligibility_rule: 'apollo-msp-v1' },
    });
  }

  return {
    updates,
    counts: {
      sourceRows: args.rows.length,
      providerVerified,
      eligibleMsp,
      held,
      suppressed,
      converted,
      terminalPreserved,
      missingContact,
    },
    reasons,
  };
}

/** Apply the reviewed plan without enrolling a prospect, freezing an audience, or sending mail. */
export async function applyApolloMspPromotion(
  supabase: SupabaseClient,
  plan: ApolloPromotionPlan,
  nowIso = new Date().toISOString(),
): Promise<{ updated: number; stale: number; errors: readonly string[] }> {
  let updated = 0;
  let stale = 0;
  const errors: string[] = [];
  for (let start = 0; start < plan.updates.length; start += 25) {
    const batch = plan.updates.slice(start, start + 25);
    const results = await Promise.all(batch.map(async (item) => {
      const { data, error } = await supabase
        .from('outreach_contacts')
        .update({
          segment: item.segment,
          tags: item.tags,
          source_class: 'operator_manual',
          eligibility_status: item.status,
          eligibility_reason: item.reason,
          eligibility_checked_at: nowIso,
          provenance: item.provenance,
          updated_at: nowIso,
        })
        .eq('id', item.id)
        .eq('eligibility_status', item.previousStatus)
        .select('id');
      return { item, data, error };
    }));
    for (const result of results) {
      if (result.error) errors.push(`${result.item.email}: ${result.error.message}`);
      else if ((result.data ?? []).length === 0) stale += 1;
      else updated += 1;
    }
  }
  return { updated, stale, errors };
}

export async function listContacts(supabase: SupabaseClient, segment?: string | null): Promise<ContactRow[]> {
  let query = supabase
    .from('outreach_contacts')
    .select('id,email,name,company,url,segment,tags,city,source,personalization_reason,personalization_source_url,personalization_verified_at,added_to_sequence_at,eligibility_status,created_at')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (segment) query = query.eq('segment', segment);
  const { data } = await query;
  return (data ?? []) as ContactRow[];
}

export async function listSegments(
  supabase: SupabaseClient
): Promise<{ segment: string; total: number; saved: number }[]> {
  const { data } = await supabase.from('outreach_contacts').select('segment,added_to_sequence_at').limit(5000);
  const map = new Map<string, { total: number; saved: number }>();
  for (const row of (data ?? []) as { segment: string; added_to_sequence_at: string | null }[]) {
    const entry = map.get(row.segment) ?? { total: 0, saved: 0 };
    entry.total += 1;
    if (!row.added_to_sequence_at) entry.saved += 1;
    map.set(row.segment, entry);
  }
  return Array.from(map.entries())
    .map(([segment, v]) => ({ segment, ...v }))
    .sort((a, b) => a.segment.localeCompare(b.segment));
}

/** Pure: staggered first-send times, one per spacing step, exported for tests. */
export function staggeredRunTimes(startMs: number, count: number, spacingMinutes = 60): string[] {
  return Array.from({ length: count }, (_, i) => new Date(startMs + i * spacingMinutes * 60_000).toISOString());
}

/**
 * The one-click promotion: every still-saved contact in the segment becomes a scheduled
 * prospect. Skips (never resurrects) unsubscribed emails and existing prospects.
 */
export async function addSegmentToSequence(args: {
  supabase: SupabaseClient;
  segment: string;
  startMs: number;
  cadence?: OutreachCadence;
  spacingMinutes?: number;
}): Promise<{ added: number; skippedUnsubscribed: number; skippedExisting: number; skippedIneligible: number; error?: string }> {
  const { supabase, segment, startMs } = args;
  const cadence = normalizeOutreachCadence(args.cadence ?? 'monthly');

  const savedContacts = (await listContacts(supabase, segment)).filter((c) => !c.added_to_sequence_at);
  const contacts = savedContacts.filter((contact) => contact.eligibility_status === 'eligible');
  const skippedIneligible = savedContacts.length - contacts.length;
  if (contacts.length === 0) {
    return { added: 0, skippedUnsubscribed: 0, skippedExisting: 0, skippedIneligible };
  }

  const emails = contacts.map((c) => c.email);
  const { data: prospectRows } = await supabase
    .from('outreach_prospects')
    .select('email,unsubscribed_at')
    .in('email', emails);
  const unsubscribed = new Set(
    ((prospectRows ?? []) as { email: string; unsubscribed_at: string | null }[])
      .filter((p) => p.unsubscribed_at != null)
      .map((p) => p.email.toLowerCase())
  );
  const existing = new Set(
    ((prospectRows ?? []) as { email: string }[]).map((p) => p.email.toLowerCase())
  );

  const eligible = contacts.filter((c) => !existing.has(c.email.toLowerCase()));
  const skippedUnsubscribed = contacts.filter((c) => unsubscribed.has(c.email.toLowerCase())).length;
  const times = staggeredRunTimes(startMs, eligible.length, args.spacingMinutes ?? 60);

  let added = 0;
  for (let i = 0; i < eligible.length; i += 1) {
    const contact = eligible[i];
    if (!contact) continue;
    const { data, error } = await supabase
      .from('outreach_prospects')
      .insert({
        email: contact.email,
        name: contact.name,
        company: contact.company,
        url: contact.url,
        cadence,
        enabled: true,
        lifecycle_status: 'active',
        sequence_step: 1,
        max_sequence_steps: 3,
        sequence_delays_days: [0, 4, 10],
        consecutive_failures: 0,
        max_attempts: 3,
        owner: 'elena',
        next_action: 'send sequence step 1 of 3',
        closure_condition: 'reply, unsubscribe, disqualification, conversion, or sequence completion',
        segment: contact.segment,
        personalization_reason: contact.personalization_reason,
        personalization_source_url: contact.personalization_source_url,
        personalization_verified_at: contact.personalization_verified_at,
        next_run_at: times[i],
      })
      .select('id')
      .single();
    if (error || !data?.id) continue;
    added += 1;
    await supabase
      .from('outreach_contacts')
      .update({ added_to_sequence_at: new Date().toISOString(), prospect_id: data.id as string, updated_at: new Date().toISOString() })
      .eq('id', contact.id);
  }

  return {
    added,
    skippedUnsubscribed,
    skippedExisting: contacts.length - eligible.length - skippedUnsubscribed < 0 ? 0 : contacts.length - eligible.length,
    skippedIneligible,
  };
}
