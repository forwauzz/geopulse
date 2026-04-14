import { z } from 'zod';

/**
 * Optional attribution fields that client components attach to API requests.
 * Merge into any route's body schema via `.extend(optionalAttributionFields.shape)`.
 */
export const optionalAttributionFields = z.object({
  anonymous_id: z.string().max(128).nullish(),
  utm_source: z.string().max(500).nullish(),
  utm_medium: z.string().max(500).nullish(),
  utm_campaign: z.string().max(500).nullish(),
  utm_content: z.string().max(500).nullish(),
  utm_term: z.string().max(500).nullish(),
  referrer_url: z.string().max(2048).nullish(),
  landing_path: z.string().max(2048).nullish(),
});

export type OptionalAttributionFields = z.infer<typeof optionalAttributionFields>;
