/**
 * Frozen campaign audiences (VCI-8 / ECP-1).
 *
 * A campaign's recipient list is decided ONCE, at freeze time, and never re-derived. Segments are
 * living queries — new imports, suppressions, and conversions change them constantly — so a
 * campaign that re-ran its query at send time would quietly mail people the operator never
 * reviewed. Freezing produces an ordered member list plus a checksum; ECP-3's preflight compares
 * that checksum before scheduling and fails closed when it drifts.
 *
 * Selection here is deliberately narrower than storage: the contact bank keeps everything it can
 * prove, and only a contact that survives every exclusion below can enter an audience.
 */
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContactEligibility } from './agency-contact-intake';
import { fetchAllRows } from './supabase-page';

export type AudienceExclusionReason =
  | 'not_eligible'
  | 'unsubscribed'
  | 'converted'
  | 'suppressed'
  | 'conflicting_active_sequence'
  | 'already_enrolled'
  | 'over_recipient_cap';

export interface AudienceCandidate {
  readonly contactId: string;
  readonly email: string;
  readonly name: string | null;
  readonly company: string | null;
  readonly contactTitle: string | null;
  readonly segment: string;
  readonly eligibilityStatus: ContactEligibility;
}

export interface AudienceEvidence {
  readonly unsubscribedEmails: ReadonlySet<string>;
  readonly convertedEmails: ReadonlySet<string>;
  readonly suppressedEmails: ReadonlySet<string>;
  /** Emails with an enabled, non-terminal prospect — a second sequence would collide with it. */
  readonly activeSequenceEmails: ReadonlySet<string>;
  /** Contact ids already locked into another live audience. */
  readonly enrolledContactIds: ReadonlySet<string>;
}

export interface AudienceMember {
  readonly contactId: string;
  readonly email: string;
  readonly position: number;
}

export interface AudienceSelection {
  readonly members: readonly AudienceMember[];
  readonly excluded: readonly { readonly contactId: string; readonly email: string; readonly reason: AudienceExclusionReason }[];
  readonly excludedCounts: Readonly<Partial<Record<AudienceExclusionReason, number>>>;
  readonly checksum: string;
}

const DECISION_MAKER_TITLE_RE = /(owner|founder|co-?founder|president|chief executive|ceo|managing (director|partner)|partner|principal)/i;

/**
 * "Strongest" is evidence quality, not enthusiasm: a named decision-maker at a real company
 * outranks a bare address. Ties break on email so the same inputs always freeze the same cohort —
 * a nondeterministic order would make the checksum meaningless.
 */
export function contactStrengthScore(candidate: AudienceCandidate): number {
  let score = 0;
  if (candidate.name && candidate.name.trim().split(/\s+/).length >= 2) score += 3;
  if (candidate.contactTitle && DECISION_MAKER_TITLE_RE.test(candidate.contactTitle)) score += 3;
  if (candidate.company) score += 1;
  const local = candidate.email.slice(0, candidate.email.indexOf('@'));
  if (/^[a-z]+(\.[a-z]+)?$/.test(local)) score += 1;
  return score;
}

/** Stable, order-independent identity of a recipient list. */
export function audienceChecksum(members: readonly AudienceMember[]): string {
  const canonical = members
    .map((member) => `${String(member.position)}:${member.contactId}:${member.email}`)
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

export function enrollmentIdempotencyKey(args: {
  readonly interventionKey: string;
  readonly campaignVersion: number;
  readonly contactId: string;
}): string {
  return `${args.interventionKey}@v${String(args.campaignVersion)}:${args.contactId}`;
}

/**
 * Pure cohort selection. Every exclusion is named and counted so the operator sees why a segment
 * of 55 produced an audience of 25 without opening a ledger.
 */
export function selectCampaignAudience(args: {
  readonly candidates: readonly AudienceCandidate[];
  readonly evidence: AudienceEvidence;
  readonly limit: number;
}): AudienceSelection {
  const excluded: { contactId: string; email: string; reason: AudienceExclusionReason }[] = [];

  const survivors = args.candidates.filter((candidate) => {
    const email = candidate.email.toLowerCase();
    const reason: AudienceExclusionReason | null =
      candidate.eligibilityStatus !== 'eligible' ? 'not_eligible'
      : args.evidence.unsubscribedEmails.has(email) ? 'unsubscribed'
      : args.evidence.convertedEmails.has(email) ? 'converted'
      : args.evidence.suppressedEmails.has(email) ? 'suppressed'
      : args.evidence.activeSequenceEmails.has(email) ? 'conflicting_active_sequence'
      : args.evidence.enrolledContactIds.has(candidate.contactId) ? 'already_enrolled'
      : null;
    if (reason) {
      excluded.push({ contactId: candidate.contactId, email: candidate.email, reason });
      return false;
    }
    return true;
  });

  const ranked = [...survivors].sort(
    (a, b) => contactStrengthScore(b) - contactStrengthScore(a) || a.email.localeCompare(b.email),
  );

  for (const overflow of ranked.slice(Math.max(0, args.limit))) {
    excluded.push({ contactId: overflow.contactId, email: overflow.email, reason: 'over_recipient_cap' });
  }

  const members: AudienceMember[] = ranked.slice(0, Math.max(0, args.limit)).map((candidate, index) => ({
    contactId: candidate.contactId,
    email: candidate.email,
    position: index + 1,
  }));

  const excludedCounts: Partial<Record<AudienceExclusionReason, number>> = {};
  for (const item of excluded) {
    excludedCounts[item.reason] = (excludedCounts[item.reason] ?? 0) + 1;
  }

  return { members, excluded, excludedCounts, checksum: audienceChecksum(members) };
}

// ── Persistence ─────────────────────────────────────────────────────────────────

export interface FrozenAudience {
  readonly id: string;
  readonly audienceKey: string;
  readonly campaignVersion: number;
  readonly recipientCount: number;
  readonly checksum: string;
}

/**
 * `excludeInterventionId` keeps a campaign from seeing its OWN prospects as a conflicting
 * sequence. Without it, scheduling is a one-shot operation that can never be retried: the first
 * run creates 25 active prospects, and a retry after a partial failure is refused by the conflict
 * gate before the idempotency keys ever get a chance to make it safe. A contact already enrolled
 * in this intervention is not a conflict — it is this campaign's own work.
 */
export async function loadAudienceEvidence(
  supabase: SupabaseClient,
  options: { readonly excludeInterventionId?: string } = {},
): Promise<AudienceEvidence> {
  const unsubscribedEmails = new Set<string>();
  const convertedEmails = new Set<string>();
  const suppressedEmails = new Set<string>();
  const activeSequenceEmails = new Set<string>();
  const enrolledContactIds = new Set<string>();

  // Every read here is paginated: PostgREST silently caps a response at the server's max-rows,
  // and a suppression set that stops at 1000 rows would let the 1001st unsubscribed address
  // through as eligible.
  const prospects = await fetchAllRows<{ email: string; enabled: boolean; lifecycle_status: string | null; unsubscribed_at: string | null; growth_intervention_id: string | null }>(
    () => supabase.from('outreach_prospects').select('email,enabled,lifecycle_status,unsubscribed_at,growth_intervention_id'),
    'outreach_prospects audience evidence',
  );
  for (const row of prospects) {
    const email = row.email.toLowerCase();
    // Terminal states are absolute regardless of which campaign produced them: an unsubscribe
    // this campaign itself caused still silences this campaign.
    if (row.unsubscribed_at) unsubscribedEmails.add(email);
    if (row.lifecycle_status === 'converted') convertedEmails.add(email);
    if (
      row.lifecycle_status === 'disqualified'
      || row.lifecycle_status === 'unsubscribed'
      || row.lifecycle_status === 'replied'
      || row.lifecycle_status === 'positive_reply'
    ) suppressedEmails.add(email);

    const isOwnCampaign = Boolean(options.excludeInterventionId)
      && String(row.growth_intervention_id ?? '') === options.excludeInterventionId;
    if (!isOwnCampaign && row.enabled && (row.lifecycle_status === 'active' || row.lifecycle_status === 'paused')) {
      activeSequenceEmails.add(email);
    }
  }

  const subscriptions = await fetchAllRows<{ email: string }>(
    () => supabase.from('monitoring_subscriptions').select('email,status').in('status', ['active', 'trialing']),
    'monitoring_subscriptions',
  );
  for (const row of subscriptions) convertedEmails.add(row.email.toLowerCase());

  const enrollments = await fetchAllRows<{ contact_id: string; intervention_id: string | null }>(
    () => supabase
      .from('outreach_campaign_enrollments')
      .select('contact_id,status,intervention_id')
      .in('status', ['enrolled', 'sending']),
    'outreach_campaign_enrollments',
  );
  for (const row of enrollments) {
    // Same reasoning: this campaign's own enrollment must not block its own retry.
    if (options.excludeInterventionId && String(row.intervention_id ?? '') === options.excludeInterventionId) continue;
    enrolledContactIds.add(String(row.contact_id));
  }

  const contacts = await fetchAllRows<{ email: string; eligibility_status: string }>(
    () => supabase.from('outreach_contacts').select('email,eligibility_status').in('eligibility_status', ['suppressed', 'converted']),
    'outreach_contacts suppression state',
  );
  for (const row of contacts) {
    if (row.eligibility_status === 'converted') convertedEmails.add(row.email.toLowerCase());
    else suppressedEmails.add(row.email.toLowerCase());
  }

  return { unsubscribedEmails, convertedEmails, suppressedEmails, activeSequenceEmails, enrolledContactIds };
}

export async function loadAudienceCandidates(supabase: SupabaseClient, segment: string): Promise<AudienceCandidate[]> {
  const data = await fetchAllRows<Record<string, unknown>>(
    () => supabase
      .from('outreach_contacts')
      .select('id,email,name,company,contact_title,segment,eligibility_status')
      .eq('segment', segment),
    `outreach_contacts segment ${segment}`,
  );
  return data.map((row) => ({
    contactId: String(row.id),
    email: String(row.email).toLowerCase(),
    name: (row.name as string | null) ?? null,
    company: (row.company as string | null) ?? null,
    contactTitle: (row.contact_title as string | null) ?? null,
    segment: String(row.segment ?? ''),
    eligibilityStatus: (row.eligibility_status as ContactEligibility) ?? 'needs_verification',
  }));
}

/**
 * Freeze one audience for one campaign version. Re-freezing the same version is a no-op that
 * returns the existing snapshot — the audience is evidence of what was reviewed, so a second
 * call must never silently replace it with a newer segment state.
 */
export async function freezeCampaignAudience(args: {
  readonly supabase: SupabaseClient;
  readonly campaignId: string;
  readonly interventionId: string;
  readonly interventionKey: string;
  readonly campaignVersion: number;
  readonly sourceSegment: string;
  readonly selection: AudienceSelection;
  readonly selectionReason: string;
}): Promise<{ ok: true; audience: FrozenAudience; created: boolean } | { ok: false; reason: string }> {
  const audienceKey = `${args.interventionKey}@v${String(args.campaignVersion)}`;

  const { data: existing } = await args.supabase
    .from('outreach_campaign_audiences')
    .select('id,audience_key,campaign_version,recipient_count,checksum')
    .eq('audience_key', audienceKey)
    .maybeSingle();
  if (existing?.id) {
    return {
      ok: true,
      created: false,
      audience: {
        id: String(existing.id),
        audienceKey: String(existing.audience_key),
        campaignVersion: Number(existing.campaign_version),
        recipientCount: Number(existing.recipient_count),
        checksum: String(existing.checksum),
      },
    };
  }

  const { data: inserted, error } = await args.supabase
    .from('outreach_campaign_audiences')
    .insert({
      campaign_id: args.campaignId,
      intervention_id: args.interventionId,
      audience_key: audienceKey,
      campaign_version: args.campaignVersion,
      source_segment: args.sourceSegment,
      recipient_count: args.selection.members.length,
      checksum: args.selection.checksum,
      selection_reason: args.selectionReason,
      excluded_counts: args.selection.excludedCounts,
    })
    .select('id')
    .single();
  if (error || !inserted?.id) return { ok: false, reason: error?.message ?? 'audience_insert_failed' };

  const audienceId = String(inserted.id);
  const { error: memberError } = await args.supabase.from('outreach_campaign_audience_members').insert(
    args.selection.members.map((member) => ({
      audience_id: audienceId,
      contact_id: member.contactId,
      email: member.email,
      position: member.position,
    })),
  );
  if (memberError) {
    // A snapshot without its members would read as an empty approved audience. Remove the
    // half-written header so the operator retries a clean freeze instead of scheduling zero.
    await args.supabase.from('outreach_campaign_audiences').delete().eq('id', audienceId);
    return { ok: false, reason: memberError.message };
  }

  return {
    ok: true,
    created: true,
    audience: {
      id: audienceId,
      audienceKey,
      campaignVersion: args.campaignVersion,
      recipientCount: args.selection.members.length,
      checksum: args.selection.checksum,
    },
  };
}

/** Re-derive the checksum of a stored audience so drift is detectable at preflight (ECP-3). */
export async function verifyFrozenAudience(
  supabase: SupabaseClient,
  audienceId: string,
): Promise<{ ok: true; checksum: string; recipientCount: number } | { ok: false; reason: string }> {
  const { data: header } = await supabase
    .from('outreach_campaign_audiences')
    .select('checksum,recipient_count')
    .eq('id', audienceId)
    .maybeSingle();
  if (!header) return { ok: false, reason: 'audience_not_found' };

  const { data: members } = await supabase
    .from('outreach_campaign_audience_members')
    .select('contact_id,email,position')
    .eq('audience_id', audienceId)
    .order('position', { ascending: true });

  const rebuilt = ((members ?? []) as Record<string, unknown>[]).map((row) => ({
    contactId: String(row.contact_id),
    email: String(row.email),
    position: Number(row.position),
  }));
  const checksum = audienceChecksum(rebuilt);
  if (checksum !== String(header.checksum)) return { ok: false, reason: 'audience_checksum_mismatch' };
  if (rebuilt.length !== Number(header.recipient_count)) return { ok: false, reason: 'audience_recipient_count_mismatch' };
  return { ok: true, checksum, recipientCount: rebuilt.length };
}
