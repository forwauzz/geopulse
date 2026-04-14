import type { SupabaseClient } from '@supabase/supabase-js';
import { MarketingEventSchema, type MarketingEvent, type MarketingEventInsert } from './schema';

export type IngestResult =
  | { ok: true; status: 201; event_id: string }
  | { ok: true; status: 200; event_id: string; duplicate: true }
  | { ok: false; status: 400 | 500; reason: string };

function isUniqueViolation(err: { code?: string } | null): boolean {
  return err?.code === '23505';
}

export function validateEvent(raw: unknown): { ok: true; data: MarketingEvent } | { ok: false; reason: string } {
  const result = MarketingEventSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, reason: result.error.flatten().fieldErrors as unknown as string };
  }
  return { ok: true, data: result.data };
}

export async function ingestEvent(
  supabase: SupabaseClient,
  raw: unknown
): Promise<IngestResult> {
  const validation = validateEvent(raw);
  if (!validation.ok) {
    return { ok: false, status: 400, reason: validation.reason };
  }

  const event = validation.data;
  const row: MarketingEventInsert = {
    ...event,
    event_ts: event.event_ts ?? new Date().toISOString(),
    metadata_json: event.metadata_json ?? {},
  };

  const { error } = await supabase.schema('analytics').from('marketing_events').insert({
    event_id: row.event_id,
    event_name: row.event_name,
    event_ts: row.event_ts,
    anonymous_id: row.anonymous_id ?? null,
    scan_id: row.scan_id ?? null,
    lead_id: row.lead_id ?? null,
    payment_id: row.payment_id ?? null,
    user_id: row.user_id ?? null,
    email_hash: row.email_hash ?? null,
    utm_source: row.utm_source ?? null,
    utm_medium: row.utm_medium ?? null,
    utm_campaign: row.utm_campaign ?? null,
    utm_content: row.utm_content ?? null,
    utm_term: row.utm_term ?? null,
    referrer_url: row.referrer_url ?? null,
    landing_path: row.landing_path ?? null,
    channel: row.channel ?? null,
    content_id: row.content_id ?? null,
    metadata_json: row.metadata_json,
  });

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: true, status: 200, event_id: row.event_id, duplicate: true };
    }
    return { ok: false, status: 500, reason: error.message };
  }

  return { ok: true, status: 201, event_id: row.event_id };
}
