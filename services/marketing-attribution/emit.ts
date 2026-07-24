import type { SupabaseClient } from '@supabase/supabase-js';
import { structuredLog } from '@/lib/server/structured-log';
import { ingestEvent } from './ingest';
import type { MarketingEventName } from './schema';
import { canonicalizeSource, hashEmailSha256 } from './hash';

export type EmitContext = {
  event_id?: string;
  idempotency_key?: string;
  anonymous_id?: string | null;
  scan_id?: string | null;
  lead_id?: string | null;
  payment_id?: string | null;
  user_id?: string | null;
  email?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  referrer_url?: string | null;
  landing_path?: string | null;
  channel?: string | null;
  content_id?: string | null;
  metadata?: Record<string, unknown>;
};

export async function stableMarketingEventId(key: string): Promise<string> {
  const bytes = new TextEncoder().encode(`geo-pulse-marketing-event:${key}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Fire-and-forget attribution event emit.
 * Never throws — logs failures but does not propagate to caller.
 */
export async function emitMarketingEvent(
  supabase: SupabaseClient,
  eventName: MarketingEventName,
  ctx: EmitContext
): Promise<void> {
  try {
    const emailHash = ctx.email ? await hashEmailSha256(ctx.email) : null;
    const source = ctx.utm_source ? canonicalizeSource(ctx.utm_source) : null;

    const eventId = ctx.event_id
      ?? (ctx.idempotency_key ? await stableMarketingEventId(ctx.idempotency_key) : crypto.randomUUID());
    const result = await ingestEvent(supabase, {
      event_id: eventId,
      event_name: eventName,
      anonymous_id: ctx.anonymous_id ?? null,
      scan_id: ctx.scan_id ?? null,
      lead_id: ctx.lead_id ?? null,
      payment_id: ctx.payment_id ?? null,
      user_id: ctx.user_id ?? null,
      email_hash: emailHash,
      utm_source: source,
      utm_medium: ctx.utm_medium ?? null,
      utm_campaign: ctx.utm_campaign ?? null,
      utm_content: ctx.utm_content ?? null,
      utm_term: ctx.utm_term ?? null,
      referrer_url: ctx.referrer_url ?? null,
      landing_path: ctx.landing_path ?? null,
      channel: ctx.channel ?? null,
      content_id: ctx.content_id ?? null,
      metadata_json: ctx.metadata ?? {},
    });

    if (!result.ok) {
      structuredLog('marketing_event_emit_failed', {
        event: eventName,
        reason: result.reason,
      });
    }
  } catch (err) {
    structuredLog('marketing_event_emit_error', {
      event: eventName,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}
