import { z } from 'zod';

export const MARKETING_EVENT_NAMES = [
  'session_started',
  'scan_started',
  'scan_completed',
  'lead_submitted',
  'checkout_started',
  'payment_completed',
  'report_delivered',
] as const;

export type MarketingEventName = (typeof MARKETING_EVENT_NAMES)[number];

const utmString = z
  .string()
  .max(500)
  .transform((v) => v.trim().toLowerCase())
  .nullable()
  .optional();

export const MarketingEventSchema = z
  .object({
    event_id: z.string().uuid(),
    event_name: z.enum(MARKETING_EVENT_NAMES),
    event_ts: z.string().datetime().optional(),
    anonymous_id: z.string().max(128).nullable().optional(),
    scan_id: z.string().uuid().nullable().optional(),
    lead_id: z.string().uuid().nullable().optional(),
    payment_id: z.string().uuid().nullable().optional(),
    user_id: z.string().uuid().nullable().optional(),
    email_hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/, 'Must be full SHA-256 hex (64 chars)')
      .nullable()
      .optional(),
    utm_source: utmString,
    utm_medium: utmString,
    utm_campaign: utmString,
    utm_content: utmString,
    utm_term: utmString,
    referrer_url: z.string().url().max(2048).nullable().optional(),
    landing_path: z.string().max(2048).nullable().optional(),
    channel: z
      .string()
      .max(100)
      .transform((v) => v.trim().toLowerCase())
      .nullable()
      .optional(),
    content_id: z.string().max(255).nullable().optional(),
    metadata_json: z.record(z.unknown()).optional(),
  })
  .strict();

export type MarketingEvent = z.infer<typeof MarketingEventSchema>;

export type MarketingEventInsert = MarketingEvent & {
  event_ts: string;
  metadata_json: Record<string, unknown>;
};
