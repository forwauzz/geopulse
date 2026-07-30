/**
 * Resolve Cloudflare bindings for API routes (OpenNext + wrangler dev).
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { registerSelfFetch } from '@workers/lib/fetch-gate';
import type { AutonomousEditorialEnv } from './autonomous-editorial-providers';
import type { SocialProductionEnv } from './social-proof-agent';
import type { WorkersAiBinding } from './workers-ai';

/** Route audits of our own domain through the self-reference binding (avoids the edge→origin 525). */
function registerSelfAuditFetch(e: Record<string, unknown>): void {
  try {
    const self = e['WORKER_SELF_REFERENCE'] as { fetch: (input: string) => Promise<Response> } | undefined;
    const appUrl = typeof e['NEXT_PUBLIC_APP_URL'] === 'string' ? (e['NEXT_PUBLIC_APP_URL'] as string) : '';
    if (self && typeof self.fetch === 'function' && appUrl) {
      registerSelfFetch(new URL(appUrl).hostname, (url) => self.fetch(url));
    }
  } catch {
    /* best effort — normal fetch path still applies */
  }
}

export type ScanApiEnv = {
  SCAN_CACHE: KVNamespace | undefined;
  NEXT_PUBLIC_APP_URL: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** OSS de-paywall flag. "true" = legacy paid (Stripe) mode; anything else = full audit free for all. */
  LEGACY_PAID_ENABLED: string;
  /** Local competitor discovery: 'live'/'gemini' = Google-Search grounding (needs billed key); else mock. */
  COMPETITOR_DISCOVERY_MODE: string;
  COMPETITOR_DISCOVERY_GEMINI_MODEL?: string;
  /** Loop 5a self-improvement — daily self-audit + email. Off unless truthy AND DB settings on. */
  SELF_IMPROVEMENT_ENABLED?: string;
  SELF_IMPROVEMENT_TARGET_URL?: string;
  SELF_IMPROVEMENT_HOUR_UTC?: string;
  SELF_IMPROVEMENT_REPORT_TO?: string;
  /** Loop 5b marketing autopilot — proposes review-gated content for weak topics. Off by default. */
  MARKETING_AUTOPILOT_ENABLED?: string;
  MARKETING_AUTOPILOT_DAILY_CAP?: string;
  MARKETING_AUTOPILOT_HOUR_UTC?: string;
  MARKETING_AUTOPILOT_KILL?: string;
  /** Admin Automation console visibility (capability flag). Off in OSS forks; on for getgeopulse. */
  AUTOMATION_CONSOLE_ENABLED?: string;
  DISTRIBUTION_ENGINE_UI_ENABLED: string;
  DISTRIBUTION_ENGINE_WRITE_ENABLED: string;
  DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED?: string;
  DISTRIBUTION_ENGINE_BACKGROUND_ENABLED?: string;
  DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT?: string;
  X_OAUTH_CLIENT_ID?: string;
  /** AES-GCM key for distribution account access and refresh tokens. */
  DISTRIBUTION_TOKEN_ENCRYPTION_KEY?: string;
  TURNSTILE_SECRET_KEY: string;
  GEMINI_API_KEY: string;
  OPENAI_API_KEY?: string;
  PERPLEXITY_API_KEY?: string;
  GEMINI_MODEL: string;
  GEMINI_ENDPOINT: string;
  BENCHMARK_EXECUTION_PROVIDER: string;
  BENCHMARK_EXECUTION_API_KEY: string;
  BENCHMARK_EXECUTION_MODEL: string;
  BENCHMARK_EXECUTION_ENABLED_MODELS?: string;
  BENCHMARK_EXECUTION_ENDPOINT: string;
  GPM_SCHEDULE_ENABLED?: string;
  GPM_ENABLED_PLATFORMS?: string;
  GPM_CHATGPT_MODEL_ID?: string;
  GPM_GEMINI_MODEL_ID?: string;
  GPM_PERPLEXITY_MODEL_ID?: string;
  GPM_MONTHLY_SPEND_CAP_USD?: string;
  GPM_CLIENT_ACTIVATION_CAP_USD?: string;
  GITHUB_APP_INSTALL_URL?: string;
  STARTUP_SLACK_APP_INSTALL_URL?: string;
  STARTUP_SLACK_CLIENT_ID?: string;
  STARTUP_SLACK_CLIENT_SECRET?: string;
  STARTUP_SLACK_SIGNING_SECRET?: string;
  STARTUP_DASHBOARD_ENABLED?: string;
  STARTUP_GITHUB_AGENT_ENABLED?: string;
  STARTUP_AUTO_PR_ENABLED?: string;
  STARTUP_SLACK_AGENT_ENABLED?: string;
  STARTUP_SLACK_AUTO_POST_ENABLED?: string;
};

export type PaymentApiEnv = ScanApiEnv & {
  SCAN_QUEUE: Queue | undefined;
  DISTRIBUTION_QUEUE?: Queue | undefined;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID_DEEP_AUDIT: string;
  // GEO-Pulse Monitoring subscription ($39/mo, $390/yr). Non-secret price ids; live in wrangler [vars].
  // Optional so env fixtures/scripts that predate them still satisfy PaymentApiEnv.
  STRIPE_PRICE_ID_MONITOR_MONTHLY?: string;
  STRIPE_PRICE_ID_MONITOR_ANNUAL?: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  /** Optional mailbox used for direct prospect replies and internal sales-request alerts. */
  SALES_REPLY_TO_EMAIL?: string;
  /** Resend webhook signing secret for verified inbound email events. */
  RESEND_INBOUND_WEBHOOK_SECRET?: string;
  /** Existing operator digest recipient; also receives requested walkthrough alerts. */
  MARKETING_REPORT_TO?: string;
  ANTHROPIC_API_KEY?: string;
  GPM_NARRATIVE_MODEL?: string;
  GPM_REPORT_R2_PUBLIC_BASE?: string;
  KIT_API_KEY: string;
  BUTTONDOWN_API_KEY: string;
  GHOST_ADMIN_API_URL: string;
  GHOST_ADMIN_API_KEY: string;
  GHOST_ADMIN_API_VERSION: string;
  X_ACCESS_TOKEN?: string;
  X_API_BASE_URL?: string;
  LINKEDIN_ACCESS_TOKEN?: string;
  LINKEDIN_AUTHOR_URN?: string;
  LINKEDIN_API_BASE_URL?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;
  INSTAGRAM_GRAPH_API_BASE_URL?: string;
  X_OAUTH_CLIENT_ID?: string;
  X_OAUTH_CLIENT_SECRET?: string;
  X_OAUTH_TOKEN_URL?: string;
  LINKEDIN_OAUTH_CLIENT_ID?: string;
  LINKEDIN_OAUTH_CLIENT_SECRET?: string;
  LINKEDIN_OAUTH_TOKEN_URL?: string;
  INSTAGRAM_OAUTH_CLIENT_ID?: string;
  INSTAGRAM_OAUTH_CLIENT_SECRET?: string;
  INSTAGRAM_OAUTH_TOKEN_URL?: string;
  NEXT_PUBLIC_APP_URL: string;
  /** Set via wrangler secret / .dev.vars — required for POST /api/admin/reconcile-deep-audit */
  RECONCILE_SECRET: string;
  /** GitHub App credentials — let the Fix Agent open PRs on a customer's connected repo. */
  GITHUB_APP_ID?: string;
  /** PKCS#8 or PKCS#1 PEM. Store as a Worker secret, never a plaintext var. */
  GITHUB_APP_PRIVATE_KEY?: string;
  /** Optional secret for headless (cron/CI) trigger of POST /api/admin/self-improve. */
  SELF_IMPROVEMENT_TRIGGER_SECRET?: string;
  /** Optional secret for headless (cron/CI) trigger of POST /api/admin/marketing-autopilot. */
  MARKETING_AUTOPILOT_TRIGGER_SECRET?: string;
  /** Plaintext var: default `page_limit` for new `scan_runs` on paid deep audit (1–1000). */
  DEEP_AUDIT_DEFAULT_PAGE_LIMIT: string;
  /** Plaintext var: off, auto, or force for optional Browser Rendering on paid deep audits. */
  DEEP_AUDIT_BROWSER_RENDER_MODE: string;
  DEEP_AUDIT_INTERNAL_REWRITE_ENABLED: string;
  DEEP_AUDIT_INTERNAL_REWRITE_MODEL: string;
  /** 'workers_ai' (free/open-source) or 'gemini'. Optional — defaults to the Gemini path. */
  DEEP_AUDIT_INTERNAL_REWRITE_PROVIDER?: string;
  /** Autonomous SEO owner. Tokens are encrypted at rest with this separate key. */
  DATAFORSEO_LOGIN?: string;
  DATAFORSEO_PASSWORD?: string;
  GOOGLE_SEARCH_CONSOLE_CLIENT_ID?: string;
  GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET?: string;
  SEO_TOKEN_ENCRYPTION_KEY?: string;
};

/**
 * OpenNext may expose bindings on `env` or via `process.env` (nodejs_compat). Prefer non-empty `env`, then process.
 */
function pickEnvString(e: Record<string, unknown>, key: string): string {
  const fromBinding = e[key];
  if (typeof fromBinding === 'string' && fromBinding.length > 0) {
    return fromBinding;
  }
  const fromProcess = process.env[key];
  return typeof fromProcess === 'string' && fromProcess.length > 0 ? fromProcess : '';
}

/**
 * OpenNext: `getCloudflareContext({ async: true })` may use the Node path and omit **Queue** bindings.
 * Sync `getCloudflareContext({ async: false })` reads the Worker global and often has the full `env` (incl. `SCAN_QUEUE`).
 */
function resolveScanQueue(e: Record<string, unknown>): Queue | undefined {
  const direct = e['SCAN_QUEUE'];
  if (direct && typeof (direct as Queue).send === 'function') {
    return direct as Queue;
  }
  try {
    const { env: syncEnv } = getCloudflareContext({ async: false });
    const q = (syncEnv as unknown as Record<string, unknown>)['SCAN_QUEUE'];
    if (q && typeof (q as Queue).send === 'function') {
      return q as Queue;
    }
  } catch {
    /* sync context unavailable (e.g. SSG, top-level, or dev without init) */
  }
  return undefined;
}

function resolveQueueBinding(e: Record<string, unknown>, key: string): Queue | undefined {
  const direct = e[key];
  if (direct && typeof (direct as Queue).send === 'function') {
    return direct as Queue;
  }
  try {
    const { env: syncEnv } = getCloudflareContext({ async: false });
    const q = (syncEnv as unknown as Record<string, unknown>)[key];
    if (q && typeof (q as Queue).send === 'function') {
      return q as Queue;
    }
  } catch {
    /* sync context unavailable */
  }
  return undefined;
}

function readEnvRecord(e: Record<string, unknown>): ScanApiEnv {
  return {
    SCAN_CACHE: e['SCAN_CACHE'] as KVNamespace | undefined,
    NEXT_PUBLIC_APP_URL: String(e['NEXT_PUBLIC_APP_URL'] ?? ''),
    NEXT_PUBLIC_SUPABASE_URL: String(e['NEXT_PUBLIC_SUPABASE_URL'] ?? ''),
    SUPABASE_SERVICE_ROLE_KEY: String(e['SUPABASE_SERVICE_ROLE_KEY'] ?? ''),
    LEGACY_PAID_ENABLED: String(e['LEGACY_PAID_ENABLED'] ?? ''),
    COMPETITOR_DISCOVERY_MODE: String(e['COMPETITOR_DISCOVERY_MODE'] ?? ''),
    COMPETITOR_DISCOVERY_GEMINI_MODEL: String(e['COMPETITOR_DISCOVERY_GEMINI_MODEL'] ?? ''),
    SELF_IMPROVEMENT_ENABLED: String(e['SELF_IMPROVEMENT_ENABLED'] ?? ''),
    SELF_IMPROVEMENT_TARGET_URL: String(e['SELF_IMPROVEMENT_TARGET_URL'] ?? ''),
    SELF_IMPROVEMENT_HOUR_UTC: String(e['SELF_IMPROVEMENT_HOUR_UTC'] ?? ''),
    SELF_IMPROVEMENT_REPORT_TO: String(e['SELF_IMPROVEMENT_REPORT_TO'] ?? ''),
    MARKETING_AUTOPILOT_ENABLED: String(e['MARKETING_AUTOPILOT_ENABLED'] ?? ''),
    MARKETING_AUTOPILOT_DAILY_CAP: String(e['MARKETING_AUTOPILOT_DAILY_CAP'] ?? ''),
    MARKETING_AUTOPILOT_HOUR_UTC: String(e['MARKETING_AUTOPILOT_HOUR_UTC'] ?? ''),
    MARKETING_AUTOPILOT_KILL: String(e['MARKETING_AUTOPILOT_KILL'] ?? ''),
    AUTOMATION_CONSOLE_ENABLED: String(e['AUTOMATION_CONSOLE_ENABLED'] ?? ''),
    DISTRIBUTION_ENGINE_UI_ENABLED: String(e['DISTRIBUTION_ENGINE_UI_ENABLED'] ?? ''),
    DISTRIBUTION_ENGINE_WRITE_ENABLED: String(e['DISTRIBUTION_ENGINE_WRITE_ENABLED'] ?? ''),
    DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED: String(
      e['DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED'] ?? ''
    ),
    DISTRIBUTION_ENGINE_BACKGROUND_ENABLED: String(
      e['DISTRIBUTION_ENGINE_BACKGROUND_ENABLED'] ?? ''
    ),
    DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT: String(
      e['DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT'] ?? ''
    ),
    X_OAUTH_CLIENT_ID: String(e['X_OAUTH_CLIENT_ID'] ?? ''),
    DISTRIBUTION_TOKEN_ENCRYPTION_KEY: String(
      e['DISTRIBUTION_TOKEN_ENCRYPTION_KEY'] ?? ''
    ),
    TURNSTILE_SECRET_KEY: String(e['TURNSTILE_SECRET_KEY'] ?? ''),
    GEMINI_API_KEY: String(e['GEMINI_API_KEY'] ?? ''),
    OPENAI_API_KEY: String(e['OPENAI_API_KEY'] ?? ''),
    PERPLEXITY_API_KEY: String(e['PERPLEXITY_API_KEY'] ?? ''),
    GEMINI_MODEL: String(e['GEMINI_MODEL'] ?? 'gemini-3.5-flash-lite'),
    GEMINI_ENDPOINT: String(
      e['GEMINI_ENDPOINT'] ?? 'https://generativelanguage.googleapis.com/v1beta/models'
    ),
    BENCHMARK_EXECUTION_PROVIDER: String(e['BENCHMARK_EXECUTION_PROVIDER'] ?? ''),
    BENCHMARK_EXECUTION_API_KEY: String(e['BENCHMARK_EXECUTION_API_KEY'] ?? ''),
    BENCHMARK_EXECUTION_MODEL: String(e['BENCHMARK_EXECUTION_MODEL'] ?? ''),
    BENCHMARK_EXECUTION_ENABLED_MODELS: String(e['BENCHMARK_EXECUTION_ENABLED_MODELS'] ?? ''),
    BENCHMARK_EXECUTION_ENDPOINT: String(e['BENCHMARK_EXECUTION_ENDPOINT'] ?? ''),
    GPM_SCHEDULE_ENABLED: String(e['GPM_SCHEDULE_ENABLED'] ?? ''),
    GPM_ENABLED_PLATFORMS: String(e['GPM_ENABLED_PLATFORMS'] ?? ''),
    GPM_CHATGPT_MODEL_ID: String(e['GPM_CHATGPT_MODEL_ID'] ?? ''),
    GPM_GEMINI_MODEL_ID: String(e['GPM_GEMINI_MODEL_ID'] ?? ''),
    GPM_PERPLEXITY_MODEL_ID: String(e['GPM_PERPLEXITY_MODEL_ID'] ?? ''),
    GPM_MONTHLY_SPEND_CAP_USD: String(e['GPM_MONTHLY_SPEND_CAP_USD'] ?? ''),
    GPM_CLIENT_ACTIVATION_CAP_USD: String(e['GPM_CLIENT_ACTIVATION_CAP_USD'] ?? ''),
    GITHUB_APP_INSTALL_URL: String(e['GITHUB_APP_INSTALL_URL'] ?? ''),
    STARTUP_SLACK_APP_INSTALL_URL: String(e['STARTUP_SLACK_APP_INSTALL_URL'] ?? ''),
    STARTUP_SLACK_CLIENT_ID: String(e['STARTUP_SLACK_CLIENT_ID'] ?? ''),
    STARTUP_SLACK_CLIENT_SECRET: String(e['STARTUP_SLACK_CLIENT_SECRET'] ?? ''),
    STARTUP_SLACK_SIGNING_SECRET: String(e['STARTUP_SLACK_SIGNING_SECRET'] ?? ''),
    STARTUP_DASHBOARD_ENABLED: String(e['STARTUP_DASHBOARD_ENABLED'] ?? ''),
    STARTUP_GITHUB_AGENT_ENABLED: String(e['STARTUP_GITHUB_AGENT_ENABLED'] ?? ''),
    STARTUP_AUTO_PR_ENABLED: String(e['STARTUP_AUTO_PR_ENABLED'] ?? ''),
    STARTUP_SLACK_AGENT_ENABLED: String(e['STARTUP_SLACK_AGENT_ENABLED'] ?? ''),
    STARTUP_SLACK_AUTO_POST_ENABLED: String(e['STARTUP_SLACK_AUTO_POST_ENABLED'] ?? ''),
  };
}

export async function getScanApiEnv(): Promise<ScanApiEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    registerSelfAuditFetch(env as unknown as Record<string, unknown>);
    return readEnvRecord(env as unknown as Record<string, unknown>);
  } catch {
    return {
      SCAN_CACHE: undefined,
      NEXT_PUBLIC_APP_URL: process.env['NEXT_PUBLIC_APP_URL'] ?? '',
      NEXT_PUBLIC_SUPABASE_URL: process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
      SUPABASE_SERVICE_ROLE_KEY: process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
      LEGACY_PAID_ENABLED: process.env['LEGACY_PAID_ENABLED'] ?? '',
      COMPETITOR_DISCOVERY_MODE: process.env['COMPETITOR_DISCOVERY_MODE'] ?? '',
      COMPETITOR_DISCOVERY_GEMINI_MODEL: process.env['COMPETITOR_DISCOVERY_GEMINI_MODEL'] ?? '',
      SELF_IMPROVEMENT_ENABLED: process.env['SELF_IMPROVEMENT_ENABLED'] ?? '',
      SELF_IMPROVEMENT_TARGET_URL: process.env['SELF_IMPROVEMENT_TARGET_URL'] ?? '',
      SELF_IMPROVEMENT_HOUR_UTC: process.env['SELF_IMPROVEMENT_HOUR_UTC'] ?? '',
      SELF_IMPROVEMENT_REPORT_TO: process.env['SELF_IMPROVEMENT_REPORT_TO'] ?? '',
      MARKETING_AUTOPILOT_ENABLED: process.env['MARKETING_AUTOPILOT_ENABLED'] ?? '',
      MARKETING_AUTOPILOT_DAILY_CAP: process.env['MARKETING_AUTOPILOT_DAILY_CAP'] ?? '',
      MARKETING_AUTOPILOT_HOUR_UTC: process.env['MARKETING_AUTOPILOT_HOUR_UTC'] ?? '',
      MARKETING_AUTOPILOT_KILL: process.env['MARKETING_AUTOPILOT_KILL'] ?? '',
      AUTOMATION_CONSOLE_ENABLED: process.env['AUTOMATION_CONSOLE_ENABLED'] ?? '',
      DISTRIBUTION_ENGINE_UI_ENABLED: process.env['DISTRIBUTION_ENGINE_UI_ENABLED'] ?? '',
      DISTRIBUTION_ENGINE_WRITE_ENABLED: process.env['DISTRIBUTION_ENGINE_WRITE_ENABLED'] ?? '',
      DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED:
        process.env['DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED'] ?? '',
      DISTRIBUTION_ENGINE_BACKGROUND_ENABLED:
        process.env['DISTRIBUTION_ENGINE_BACKGROUND_ENABLED'] ?? '',
      DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT:
        process.env['DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT'] ?? '',
      X_OAUTH_CLIENT_ID: process.env['X_OAUTH_CLIENT_ID'] ?? '',
      DISTRIBUTION_TOKEN_ENCRYPTION_KEY:
        process.env['DISTRIBUTION_TOKEN_ENCRYPTION_KEY'] ?? '',
      TURNSTILE_SECRET_KEY: process.env['TURNSTILE_SECRET_KEY'] ?? '',
      GEMINI_API_KEY: process.env['GEMINI_API_KEY'] ?? '',
      OPENAI_API_KEY: process.env['OPENAI_API_KEY'] ?? '',
      PERPLEXITY_API_KEY: process.env['PERPLEXITY_API_KEY'] ?? '',
      GEMINI_MODEL: process.env['GEMINI_MODEL'] ?? 'gemini-3.5-flash-lite',
      GEMINI_ENDPOINT:
        process.env['GEMINI_ENDPOINT'] ??
        'https://generativelanguage.googleapis.com/v1beta/models',
      BENCHMARK_EXECUTION_PROVIDER: process.env['BENCHMARK_EXECUTION_PROVIDER'] ?? '',
      BENCHMARK_EXECUTION_API_KEY: process.env['BENCHMARK_EXECUTION_API_KEY'] ?? '',
      BENCHMARK_EXECUTION_MODEL: process.env['BENCHMARK_EXECUTION_MODEL'] ?? '',
      BENCHMARK_EXECUTION_ENABLED_MODELS:
        process.env['BENCHMARK_EXECUTION_ENABLED_MODELS'] ?? '',
      BENCHMARK_EXECUTION_ENDPOINT: process.env['BENCHMARK_EXECUTION_ENDPOINT'] ?? '',
      GPM_SCHEDULE_ENABLED: process.env['GPM_SCHEDULE_ENABLED'] ?? '',
      GPM_ENABLED_PLATFORMS: process.env['GPM_ENABLED_PLATFORMS'] ?? '',
      GPM_CHATGPT_MODEL_ID: process.env['GPM_CHATGPT_MODEL_ID'] ?? '',
      GPM_GEMINI_MODEL_ID: process.env['GPM_GEMINI_MODEL_ID'] ?? '',
      GPM_PERPLEXITY_MODEL_ID: process.env['GPM_PERPLEXITY_MODEL_ID'] ?? '',
      GPM_MONTHLY_SPEND_CAP_USD: process.env['GPM_MONTHLY_SPEND_CAP_USD'] ?? '',
      GPM_CLIENT_ACTIVATION_CAP_USD:
        process.env['GPM_CLIENT_ACTIVATION_CAP_USD'] ?? '',
      GITHUB_APP_INSTALL_URL: process.env['GITHUB_APP_INSTALL_URL'] ?? '',
      STARTUP_SLACK_APP_INSTALL_URL: process.env['STARTUP_SLACK_APP_INSTALL_URL'] ?? '',
      STARTUP_SLACK_CLIENT_ID: process.env['STARTUP_SLACK_CLIENT_ID'] ?? '',
      STARTUP_SLACK_CLIENT_SECRET: process.env['STARTUP_SLACK_CLIENT_SECRET'] ?? '',
      STARTUP_SLACK_SIGNING_SECRET: process.env['STARTUP_SLACK_SIGNING_SECRET'] ?? '',
      STARTUP_DASHBOARD_ENABLED: process.env['STARTUP_DASHBOARD_ENABLED'] ?? '',
      STARTUP_GITHUB_AGENT_ENABLED: process.env['STARTUP_GITHUB_AGENT_ENABLED'] ?? '',
      STARTUP_AUTO_PR_ENABLED: process.env['STARTUP_AUTO_PR_ENABLED'] ?? '',
      STARTUP_SLACK_AGENT_ENABLED: process.env['STARTUP_SLACK_AGENT_ENABLED'] ?? '',
      STARTUP_SLACK_AUTO_POST_ENABLED: process.env['STARTUP_SLACK_AUTO_POST_ENABLED'] ?? '',
    };
  }
}

export async function getPaymentApiEnv(): Promise<PaymentApiEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as Record<string, unknown>;
    registerSelfAuditFetch(e);
    const base = readEnvRecord(e);
    return {
      ...base,
      SCAN_QUEUE: resolveScanQueue(e),
      DISTRIBUTION_QUEUE: resolveQueueBinding(e, 'DISTRIBUTION_QUEUE'),
      STRIPE_SECRET_KEY: pickEnvString(e, 'STRIPE_SECRET_KEY'),
      STRIPE_WEBHOOK_SECRET: pickEnvString(e, 'STRIPE_WEBHOOK_SECRET'),
      STRIPE_PRICE_ID_DEEP_AUDIT: pickEnvString(e, 'STRIPE_PRICE_ID_DEEP_AUDIT'),
      STRIPE_PRICE_ID_MONITOR_MONTHLY: pickEnvString(e, 'STRIPE_PRICE_ID_MONITOR_MONTHLY'),
      STRIPE_PRICE_ID_MONITOR_ANNUAL: pickEnvString(e, 'STRIPE_PRICE_ID_MONITOR_ANNUAL'),
      RESEND_API_KEY: pickEnvString(e, 'RESEND_API_KEY'),
      RESEND_FROM_EMAIL: pickEnvString(e, 'RESEND_FROM_EMAIL'),
      SALES_REPLY_TO_EMAIL: pickEnvString(e, 'SALES_REPLY_TO_EMAIL'),
      RESEND_INBOUND_WEBHOOK_SECRET: pickEnvString(e, 'RESEND_INBOUND_WEBHOOK_SECRET'),
      MARKETING_REPORT_TO: pickEnvString(e, 'MARKETING_REPORT_TO'),
      ANTHROPIC_API_KEY: pickEnvString(e, 'ANTHROPIC_API_KEY'),
      GPM_NARRATIVE_MODEL: pickEnvString(e, 'GPM_NARRATIVE_MODEL'),
      GPM_REPORT_R2_PUBLIC_BASE: pickEnvString(e, 'GPM_REPORT_R2_PUBLIC_BASE'),
      KIT_API_KEY: pickEnvString(e, 'KIT_API_KEY'),
      BUTTONDOWN_API_KEY: pickEnvString(e, 'BUTTONDOWN_API_KEY'),
      GHOST_ADMIN_API_URL: pickEnvString(e, 'GHOST_ADMIN_API_URL'),
      GHOST_ADMIN_API_KEY: pickEnvString(e, 'GHOST_ADMIN_API_KEY'),
      GHOST_ADMIN_API_VERSION: pickEnvString(e, 'GHOST_ADMIN_API_VERSION'),
      X_ACCESS_TOKEN: pickEnvString(e, 'X_ACCESS_TOKEN'),
      X_API_BASE_URL: pickEnvString(e, 'X_API_BASE_URL'),
      LINKEDIN_ACCESS_TOKEN: pickEnvString(e, 'LINKEDIN_ACCESS_TOKEN'),
      LINKEDIN_AUTHOR_URN: pickEnvString(e, 'LINKEDIN_AUTHOR_URN'),
      LINKEDIN_API_BASE_URL: pickEnvString(e, 'LINKEDIN_API_BASE_URL'),
      INSTAGRAM_ACCESS_TOKEN: pickEnvString(e, 'INSTAGRAM_ACCESS_TOKEN'),
      INSTAGRAM_GRAPH_API_BASE_URL: pickEnvString(e, 'INSTAGRAM_GRAPH_API_BASE_URL'),
      X_OAUTH_CLIENT_ID: pickEnvString(e, 'X_OAUTH_CLIENT_ID'),
      X_OAUTH_CLIENT_SECRET: pickEnvString(e, 'X_OAUTH_CLIENT_SECRET'),
      X_OAUTH_TOKEN_URL: pickEnvString(e, 'X_OAUTH_TOKEN_URL'),
      LINKEDIN_OAUTH_CLIENT_ID: pickEnvString(e, 'LINKEDIN_OAUTH_CLIENT_ID'),
      LINKEDIN_OAUTH_CLIENT_SECRET: pickEnvString(e, 'LINKEDIN_OAUTH_CLIENT_SECRET'),
      LINKEDIN_OAUTH_TOKEN_URL: pickEnvString(e, 'LINKEDIN_OAUTH_TOKEN_URL'),
      INSTAGRAM_OAUTH_CLIENT_ID: pickEnvString(e, 'INSTAGRAM_OAUTH_CLIENT_ID'),
      INSTAGRAM_OAUTH_CLIENT_SECRET: pickEnvString(e, 'INSTAGRAM_OAUTH_CLIENT_SECRET'),
      INSTAGRAM_OAUTH_TOKEN_URL: pickEnvString(e, 'INSTAGRAM_OAUTH_TOKEN_URL'),
      NEXT_PUBLIC_APP_URL: pickEnvString(e, 'NEXT_PUBLIC_APP_URL'),
      GITHUB_APP_ID: pickEnvString(e, 'GITHUB_APP_ID'),
      GITHUB_APP_PRIVATE_KEY: pickEnvString(e, 'GITHUB_APP_PRIVATE_KEY'),
      RECONCILE_SECRET: pickEnvString(e, 'RECONCILE_SECRET'),
      SELF_IMPROVEMENT_TRIGGER_SECRET: pickEnvString(e, 'SELF_IMPROVEMENT_TRIGGER_SECRET'),
      MARKETING_AUTOPILOT_TRIGGER_SECRET: pickEnvString(e, 'MARKETING_AUTOPILOT_TRIGGER_SECRET'),
      DEEP_AUDIT_DEFAULT_PAGE_LIMIT: pickEnvString(e, 'DEEP_AUDIT_DEFAULT_PAGE_LIMIT'),
      DEEP_AUDIT_BROWSER_RENDER_MODE: pickEnvString(e, 'DEEP_AUDIT_BROWSER_RENDER_MODE'),
      DEEP_AUDIT_INTERNAL_REWRITE_ENABLED: pickEnvString(e, 'DEEP_AUDIT_INTERNAL_REWRITE_ENABLED'),
      DEEP_AUDIT_INTERNAL_REWRITE_MODEL: pickEnvString(e, 'DEEP_AUDIT_INTERNAL_REWRITE_MODEL'),
      DEEP_AUDIT_INTERNAL_REWRITE_PROVIDER: pickEnvString(e, 'DEEP_AUDIT_INTERNAL_REWRITE_PROVIDER'),
      DATAFORSEO_LOGIN: pickEnvString(e, 'DATAFORSEO_LOGIN'),
      DATAFORSEO_PASSWORD: pickEnvString(e, 'DATAFORSEO_PASSWORD'),
      GOOGLE_SEARCH_CONSOLE_CLIENT_ID: pickEnvString(e, 'GOOGLE_SEARCH_CONSOLE_CLIENT_ID'),
      GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET: pickEnvString(e, 'GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET'),
      SEO_TOKEN_ENCRYPTION_KEY: pickEnvString(e, 'SEO_TOKEN_ENCRYPTION_KEY'),
    };
  } catch {
    return {
      ...(await getScanApiEnv()),
      SCAN_QUEUE: undefined,
      DISTRIBUTION_QUEUE: undefined,
      STRIPE_SECRET_KEY: process.env['STRIPE_SECRET_KEY'] ?? '',
      STRIPE_WEBHOOK_SECRET: process.env['STRIPE_WEBHOOK_SECRET'] ?? '',
      STRIPE_PRICE_ID_DEEP_AUDIT: process.env['STRIPE_PRICE_ID_DEEP_AUDIT'] ?? '',
      STRIPE_PRICE_ID_MONITOR_MONTHLY: process.env['STRIPE_PRICE_ID_MONITOR_MONTHLY'] ?? '',
      STRIPE_PRICE_ID_MONITOR_ANNUAL: process.env['STRIPE_PRICE_ID_MONITOR_ANNUAL'] ?? '',
      RESEND_API_KEY: process.env['RESEND_API_KEY'] ?? '',
      RESEND_FROM_EMAIL: process.env['RESEND_FROM_EMAIL'] ?? '',
      SALES_REPLY_TO_EMAIL: process.env['SALES_REPLY_TO_EMAIL'] ?? '',
      RESEND_INBOUND_WEBHOOK_SECRET: process.env['RESEND_INBOUND_WEBHOOK_SECRET'] ?? '',
      MARKETING_REPORT_TO: process.env['MARKETING_REPORT_TO'] ?? '',
      ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'] ?? '',
      GPM_NARRATIVE_MODEL: process.env['GPM_NARRATIVE_MODEL'] ?? '',
      GPM_REPORT_R2_PUBLIC_BASE: process.env['GPM_REPORT_R2_PUBLIC_BASE'] ?? '',
      KIT_API_KEY: process.env['KIT_API_KEY'] ?? '',
      BUTTONDOWN_API_KEY: process.env['BUTTONDOWN_API_KEY'] ?? '',
      GHOST_ADMIN_API_URL: process.env['GHOST_ADMIN_API_URL'] ?? '',
      GHOST_ADMIN_API_KEY: process.env['GHOST_ADMIN_API_KEY'] ?? '',
      GHOST_ADMIN_API_VERSION: process.env['GHOST_ADMIN_API_VERSION'] ?? '',
      X_ACCESS_TOKEN: process.env['X_ACCESS_TOKEN'] ?? '',
      X_API_BASE_URL: process.env['X_API_BASE_URL'] ?? '',
      LINKEDIN_ACCESS_TOKEN: process.env['LINKEDIN_ACCESS_TOKEN'] ?? '',
      LINKEDIN_AUTHOR_URN: process.env['LINKEDIN_AUTHOR_URN'] ?? '',
      LINKEDIN_API_BASE_URL: process.env['LINKEDIN_API_BASE_URL'] ?? '',
      INSTAGRAM_ACCESS_TOKEN: process.env['INSTAGRAM_ACCESS_TOKEN'] ?? '',
      INSTAGRAM_GRAPH_API_BASE_URL: process.env['INSTAGRAM_GRAPH_API_BASE_URL'] ?? '',
      X_OAUTH_CLIENT_ID: process.env['X_OAUTH_CLIENT_ID'] ?? '',
      X_OAUTH_CLIENT_SECRET: process.env['X_OAUTH_CLIENT_SECRET'] ?? '',
      X_OAUTH_TOKEN_URL: process.env['X_OAUTH_TOKEN_URL'] ?? '',
      LINKEDIN_OAUTH_CLIENT_ID: process.env['LINKEDIN_OAUTH_CLIENT_ID'] ?? '',
      LINKEDIN_OAUTH_CLIENT_SECRET: process.env['LINKEDIN_OAUTH_CLIENT_SECRET'] ?? '',
      LINKEDIN_OAUTH_TOKEN_URL: process.env['LINKEDIN_OAUTH_TOKEN_URL'] ?? '',
      INSTAGRAM_OAUTH_CLIENT_ID: process.env['INSTAGRAM_OAUTH_CLIENT_ID'] ?? '',
      INSTAGRAM_OAUTH_CLIENT_SECRET: process.env['INSTAGRAM_OAUTH_CLIENT_SECRET'] ?? '',
      INSTAGRAM_OAUTH_TOKEN_URL: process.env['INSTAGRAM_OAUTH_TOKEN_URL'] ?? '',
      NEXT_PUBLIC_APP_URL: process.env['NEXT_PUBLIC_APP_URL'] ?? '',
      RECONCILE_SECRET: process.env['RECONCILE_SECRET'] ?? '',
      SELF_IMPROVEMENT_TRIGGER_SECRET: process.env['SELF_IMPROVEMENT_TRIGGER_SECRET'] ?? '',
      MARKETING_AUTOPILOT_TRIGGER_SECRET: process.env['MARKETING_AUTOPILOT_TRIGGER_SECRET'] ?? '',
      DEEP_AUDIT_DEFAULT_PAGE_LIMIT: process.env['DEEP_AUDIT_DEFAULT_PAGE_LIMIT'] ?? '',
      DEEP_AUDIT_BROWSER_RENDER_MODE: process.env['DEEP_AUDIT_BROWSER_RENDER_MODE'] ?? '',
      DEEP_AUDIT_INTERNAL_REWRITE_ENABLED:
        process.env['DEEP_AUDIT_INTERNAL_REWRITE_ENABLED'] ?? '',
      DEEP_AUDIT_INTERNAL_REWRITE_MODEL:
        process.env['DEEP_AUDIT_INTERNAL_REWRITE_MODEL'] ?? '',
      DEEP_AUDIT_INTERNAL_REWRITE_PROVIDER:
        process.env['DEEP_AUDIT_INTERNAL_REWRITE_PROVIDER'] ?? '',
      DATAFORSEO_LOGIN: process.env['DATAFORSEO_LOGIN'] ?? '',
      DATAFORSEO_PASSWORD: process.env['DATAFORSEO_PASSWORD'] ?? '',
      GOOGLE_SEARCH_CONSOLE_CLIENT_ID: process.env['GOOGLE_SEARCH_CONSOLE_CLIENT_ID'] ?? '',
      GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET:
        process.env['GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET'] ?? '',
      SEO_TOKEN_ENCRYPTION_KEY: process.env['SEO_TOKEN_ENCRYPTION_KEY'] ?? '',
    };
  }
}

/** Cloudflare Workers AI binding (free/open-source brain), when available in this runtime. */
export async function getAiBinding(): Promise<
  { run: (model: string, input: Record<string, unknown>) => Promise<unknown> } | undefined
> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const ai = (env as unknown as Record<string, unknown>)['AI'];
    return ai && typeof (ai as { run?: unknown }).run === 'function'
      ? (ai as { run: (model: string, input: Record<string, unknown>) => Promise<unknown> })
      : undefined;
  } catch {
    return undefined;
  }
}

/** Bindings needed by the Worker-backed autonomous editorial pipeline. */
export async function getAutonomousEditorialEnv(): Promise<AutonomousEditorialEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as Record<string, unknown>;
    const ai = e['AI'];
    const reportFiles = e['REPORT_FILES'];
    return {
      AI: ai && typeof (ai as { run?: unknown }).run === 'function' ? ai as WorkersAiBinding : undefined,
      OPENAI_API_KEY: pickEnvString(e, 'OPENAI_API_KEY'),
      OPENAI_IMAGE_MODEL: pickEnvString(e, 'OPENAI_IMAGE_MODEL'),
      EDITORIAL_HERO_PUBLIC_BASE: pickEnvString(e, 'EDITORIAL_HERO_PUBLIC_BASE'),
      EDITORIAL_WRITER_MODEL: pickEnvString(e, 'EDITORIAL_WRITER_MODEL'),
      EDITORIAL_REVIEWER_MODEL: pickEnvString(e, 'EDITORIAL_REVIEWER_MODEL'),
      REPORT_FILES: reportFiles && typeof (reportFiles as { put?: unknown }).put === 'function'
        ? reportFiles as AutonomousEditorialEnv['REPORT_FILES']
        : undefined,
    };
  } catch {
    return {
      OPENAI_API_KEY: process.env['OPENAI_API_KEY'] ?? '',
      OPENAI_IMAGE_MODEL: process.env['OPENAI_IMAGE_MODEL'] ?? '',
      EDITORIAL_HERO_PUBLIC_BASE: process.env['EDITORIAL_HERO_PUBLIC_BASE'] ?? '',
      EDITORIAL_WRITER_MODEL: process.env['EDITORIAL_WRITER_MODEL'] ?? '',
      EDITORIAL_REVIEWER_MODEL: process.env['EDITORIAL_REVIEWER_MODEL'] ?? '',
    };
  }
}

/** Bindings used by Sofia's grounded research and Jordan's original social-card renderer. */
export async function getSocialProductionEnv(): Promise<SocialProductionEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as Record<string, unknown>;
    const browser = e['BROWSER'];
    const reportFiles = e['REPORT_FILES'];
    return {
      GEMINI_API_KEY: pickEnvString(e, 'GEMINI_API_KEY'),
      GEMINI_ENDPOINT: pickEnvString(e, 'GEMINI_ENDPOINT'),
      SOCIAL_TREND_GEMINI_MODEL: pickEnvString(e, 'SOCIAL_TREND_GEMINI_MODEL'),
      OPENAI_API_KEY: pickEnvString(e, 'OPENAI_API_KEY'),
      SOCIAL_TREND_OPENAI_MODEL: pickEnvString(e, 'SOCIAL_TREND_OPENAI_MODEL'),
      SOCIAL_MEDIA_PUBLIC_BASE: pickEnvString(e, 'SOCIAL_MEDIA_PUBLIC_BASE'),
      INSTAGRAM_GRAPH_API_BASE_URL: pickEnvString(e, 'INSTAGRAM_GRAPH_API_BASE_URL'),
      BROWSER:
        browser && typeof (browser as { quickAction?: unknown }).quickAction === 'function'
          ? (browser as SocialProductionEnv['BROWSER'])
          : undefined,
      REPORT_FILES:
        reportFiles && typeof (reportFiles as { put?: unknown }).put === 'function'
          ? (reportFiles as SocialProductionEnv['REPORT_FILES'])
          : undefined,
    };
  } catch {
    return {
      GEMINI_API_KEY: process.env['GEMINI_API_KEY'] ?? '',
      GEMINI_ENDPOINT: process.env['GEMINI_ENDPOINT'] ?? '',
      SOCIAL_TREND_GEMINI_MODEL: process.env['SOCIAL_TREND_GEMINI_MODEL'] ?? '',
      OPENAI_API_KEY: process.env['OPENAI_API_KEY'] ?? '',
      SOCIAL_TREND_OPENAI_MODEL: process.env['SOCIAL_TREND_OPENAI_MODEL'] ?? '',
      SOCIAL_MEDIA_PUBLIC_BASE: process.env['SOCIAL_MEDIA_PUBLIC_BASE'] ?? '',
      INSTAGRAM_GRAPH_API_BASE_URL: process.env['INSTAGRAM_GRAPH_API_BASE_URL'] ?? '',
    };
  }
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/**
 * Cloudflare Web Analytics beacon token. Public (non-secret — it appears in the page HTML), read at
 * runtime so it can live in wrangler.jsonc [vars]. Empty string when unset → the layout renders no
 * beacon (fail-closed), so the feature is dark until the operator creates the Web Analytics site and
 * sets NEXT_PUBLIC_CF_BEACON_TOKEN.
 */
export async function getCfWebAnalyticsToken(): Promise<string> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const v = (env as unknown as Record<string, unknown>)['NEXT_PUBLIC_CF_BEACON_TOKEN'];
    return typeof v === 'string' ? v.trim() : '';
  } catch {
    return (process.env['NEXT_PUBLIC_CF_BEACON_TOKEN'] ?? '').trim();
  }
}


