import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { structuredLog } from '@/lib/server/structured-log';

const eventNameSchema = z.enum([
  'session_started',
  'scan_started',
  'scan_completed',
  'lead_submitted',
  'checkout_started',
  'payment_completed',
  'report_delivered',
]);

const optionalText = z.string().trim().min(1).max(1024).optional();

export const marketingEventSchema = z
  .object({
    eventId: z.string().uuid().optional(),
    eventName: eventNameSchema,
    eventTs: z.string().datetime().optional(),
    anonymousId: optionalText,
    scanId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    paymentId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    email: z.string().email().optional(),
    emailHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    utmSource: optionalText,
    utmMedium: optionalText,
    utmCampaign: optionalText,
    utmContent: optionalText,
    utmTerm: optionalText,
    referrerUrl: z.string().url().max(2048).optional(),
    landingPath: z.string().max(2048).optional(),
    channel: optionalText,
    contentId: optionalText,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type MarketingEventInput = z.input<typeof marketingEventSchema>;

export function normalizeCampaignValue(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  return v.length > 0 ? v : null;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizedChannel(value: string | undefined): string | null {
  const v = normalizeCampaignValue(value);
  if (!v) return null;
  if (v === 'twitter' || v === 'x.com') return 'x';
  return v;
}

function normalizeLandingPath(path: string | undefined): string | null {
  if (!path) return null;
  const v = path.trim();
  if (!v) return null;
  if (v.startsWith('/')) return v;
  return `/${v}`;
}

export type StoreMarketingEventResult =
  | { ok: true; duplicate: boolean; id: string }
  | { ok: false; reason: string; status: number };

export async function storeMarketingEvent(input: MarketingEventInput): Promise<StoreMarketingEventResult> {
  const parsed = marketingEventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: JSON.stringify(parsed.error.flatten()), status: 400 };
  }

  const ev = parsed.data;
  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, reason: 'server_misconfigured', status: 503 };
  }

  const id = ev.eventId ?? randomUUID();
  const eventTs = ev.eventTs ?? new Date().toISOString();
  const emailHash = ev.emailHash ?? (ev.email ? sha256Hex(normalizeEmail(ev.email)) : null);

  const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const payload = {
    id,
    event_name: ev.eventName,
    event_ts: eventTs,
    anonymous_id: ev.anonymousId ?? null,
    scan_id: ev.scanId ?? null,
    lead_id: ev.leadId ?? null,
    payment_id: ev.paymentId ?? null,
    user_id: ev.userId ?? null,
    email_hash: emailHash,
    utm_source: normalizeCampaignValue(ev.utmSource),
    utm_medium: normalizeCampaignValue(ev.utmMedium),
    utm_campaign: normalizeCampaignValue(ev.utmCampaign),
    utm_content: normalizeCampaignValue(ev.utmContent),
    utm_term: normalizeCampaignValue(ev.utmTerm),
    referrer_url: ev.referrerUrl ?? null,
    landing_path: normalizeLandingPath(ev.landingPath),
    channel: normalizedChannel(ev.channel),
    content_id: ev.contentId ?? null,
    metadata_json: ev.metadata ?? {},
  };

  const { error } = await supabase.schema('analytics').from('marketing_events').insert(payload);

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return { ok: true, duplicate: true, id };
    }
    return { ok: false, reason: error.message, status: 500 };
  }

  return { ok: true, duplicate: false, id };
}

export type MarketingRequestContext = {
  anonymousId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrerUrl?: string;
  landingPath?: string;
  channel?: string;
  contentId?: string;
};

export function marketingContextFromRequest(request: Request): MarketingRequestContext {
  const url = new URL(request.url);
  const p = url.searchParams;

  const referrerUrl = request.headers.get('referer') ?? undefined;
  let landingPath = p.get('lp') ?? undefined;
  if (!landingPath && referrerUrl) {
    try {
      landingPath = new URL(referrerUrl).pathname;
    } catch {
      landingPath = undefined;
    }
  }

  return {
    anonymousId:
      request.headers.get('x-anonymous-id') ??
      request.headers.get('x-client-id') ??
      undefined,
    utmSource: p.get('utm_source') ?? undefined,
    utmMedium: p.get('utm_medium') ?? undefined,
    utmCampaign: p.get('utm_campaign') ?? undefined,
    utmContent: p.get('utm_content') ?? undefined,
    utmTerm: p.get('utm_term') ?? undefined,
    referrerUrl,
    landingPath,
    channel: p.get('utm_source') ?? undefined,
    contentId: p.get('utm_content') ?? undefined,
  };
}

export async function emitMarketingEventBestEffort(input: MarketingEventInput): Promise<void> {
  const result = await storeMarketingEvent(input);
  if (!result.ok) {
    structuredLog('marketing_event_emit_failed', {
      reason: result.reason.slice(0, 180),
      status: result.status,
    });
    return;
  }

  if (result.duplicate) {
    structuredLog('marketing_event_duplicate', { eventId: result.id });
  }
}
