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
  BENCHMARK_EXECUTION_PROVIDER?: string;
  BENCHMARK_EXECUTION_API_KEY?: string;
  BENCHMARK_EXECUTION_MODEL?: string;
  BENCHMARK_EXECUTION_ENABLED_MODELS?: string;
  BENCHMARK_EXECUTION_ENDPOINT?: string;
  BENCHMARK_SCHEDULE_ENABLED?: string;
  BENCHMARK_SCHEDULE_QUERY_SET_ID?: string;
  BENCHMARK_SCHEDULE_MODEL_ID?: string;
  BENCHMARK_SCHEDULE_RUN_MODES?: string;
  BENCHMARK_SCHEDULE_VERTICAL?: string;
  BENCHMARK_SCHEDULE_SEED_PRIORITIES?: string;
  BENCHMARK_SCHEDULE_DOMAINS?: string;
  BENCHMARK_SCHEDULE_DOMAIN_LIMIT?: string;
  BENCHMARK_SCHEDULE_MAX_RUNS?: string;
  BENCHMARK_SCHEDULE_MAX_FAILURES?: string;
  BENCHMARK_SCHEDULE_WINDOW_HOURS?: string;
  BENCHMARK_SCHEDULE_VERSION?: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID_DEEP_AUDIT: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  DEEP_AUDIT_INTERNAL_REWRITE_ENABLED?: string;
  DEEP_AUDIT_INTERNAL_REWRITE_MODEL?: string;
  /** Optional — set when R2 bucket exposes a public base URL for report links. */
  DEEP_AUDIT_R2_PUBLIC_BASE?: string;
  /** Optional R2 binding for deep-audit artifacts (DA-003). */
  REPORT_FILES?: R2Bucket;
}

declare namespace Cloudflare {
  interface Env extends CloudflareEnv {}
}
