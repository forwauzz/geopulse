import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { ingestEvent } from '@services/marketing-attribution/ingest';
import type { MarketingEventName } from '@services/marketing-attribution/schema';
import { structuredLog } from './structured-log';

export type ActivationEventName = Extract<
  MarketingEventName,
  'business_activation_started' | 'agency_client_activation_started'
>;

export async function deterministicActivationEventId(key: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Best-effort and idempotent: analytics never blocks the customer's first-value path. */
export async function recordActivationEvent(args: {
  readonly supabase: SupabaseClient;
  readonly eventName: ActivationEventName;
  readonly userId: string;
  readonly ownerId: string;
  readonly canonicalDomain: string;
  readonly contextVersion: string;
}): Promise<void> {
  const eventId = await deterministicActivationEventId([
    args.eventName,
    args.ownerId,
    args.canonicalDomain,
    args.contextVersion,
  ].join(':'));
  const result = await ingestEvent(args.supabase, {
    event_id: eventId,
    event_name: args.eventName,
    user_id: args.userId,
    channel: 'product',
    landing_path: args.eventName === 'business_activation_started'
      ? '/dashboard/welcome'
      : '/dashboard/clients',
    metadata_json: {
      owner_id: args.ownerId,
      canonical_domain: args.canonicalDomain,
      organization_context_version: args.contextVersion,
      onboarding_version: 'value-first-onboarding-v1',
    },
  });
  if (!result.ok) {
    structuredLog('activation_event_record_failed', {
      event_name: args.eventName,
      owner_id: args.ownerId,
      reason: typeof result.reason === 'string' ? result.reason : 'unknown',
    }, 'warning');
  }
}
