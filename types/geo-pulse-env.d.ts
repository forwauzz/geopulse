/**
 * Wrangler bindings referenced by `workers/cloudflare-entry.ts` and queue consumer.
 * For generated stubs from Wrangler, run `npm run cf-typegen` (writes gitignored `cloudflare-env.d.ts`).
 */
interface CloudflareEnv {
  SCAN_CACHE: KVNamespace;
  SCAN_QUEUE: Queue;
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  NEXT_PUBLIC_APP_URL: string;
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  GEMINI_ENDPOINT: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID_DEEP_AUDIT: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
}

declare namespace Cloudflare {
  interface Env extends CloudflareEnv {}
}
