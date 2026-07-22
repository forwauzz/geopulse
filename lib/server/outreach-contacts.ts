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
  readonly added_to_sequence_at: string | null;
  readonly created_at: string;
}

export interface ParsedContact {
  email: string;
  url: string;
  name: string | null;
  company: string | null;
  city: string | null;
}

export interface ContactParseResult {
  rows: ParsedContact[];
  invalid: { line: number; text: string; reason: string }[];
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
 *   email, url, name, company, city
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
    result.rows.push({
      email,
      url,
      name: parts[2] || null,
      company: parts[3] || null,
      city: parts[4] || null,
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
  meta: { segment: string; tags?: string[]; source?: string }
): Promise<{ imported: number; error?: string }> {
  if (rows.length === 0) return { imported: 0 };
  const payload = rows.map((r) => ({
    email: r.email,
    url: r.url,
    name: r.name,
    company: r.company,
    city: r.city,
    segment: meta.segment,
    tags: meta.tags ?? [],
    source: meta.source ?? 'manual',
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('outreach_contacts').upsert(payload, { onConflict: 'email' });
  if (error) return { imported: 0, error: error.message };
  return { imported: rows.length };
}

export async function listContacts(supabase: SupabaseClient, segment?: string | null): Promise<ContactRow[]> {
  let query = supabase
    .from('outreach_contacts')
    .select('id,email,name,company,url,segment,tags,city,source,added_to_sequence_at,created_at')
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
}): Promise<{ added: number; skippedUnsubscribed: number; skippedExisting: number; error?: string }> {
  const { supabase, segment, startMs } = args;
  const cadence = normalizeOutreachCadence(args.cadence ?? 'monthly');

  const contacts = (await listContacts(supabase, segment)).filter((c) => !c.added_to_sequence_at);
  if (contacts.length === 0) return { added: 0, skippedUnsubscribed: 0, skippedExisting: 0 };

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
  };
}
