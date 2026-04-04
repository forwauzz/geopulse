/**
 * Resolve Cloudflare bindings for API routes (OpenNext + wrangler dev).
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';

export type ScanApiEnv = {
  SCAN_CACHE: KVNamespace | undefined;
  NEXT_PUBLIC_APP_URL: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  DISTRIBUTION_ENGINE_UI_ENABLED: string;
  DISTRIBUTION_ENGINE_WRITE_ENABLED: string;
  DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED?: string;
  DISTRIBUTION_ENGINE_BACKGROUND_ENABLED?: string;
  DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT?: string;
  TURNSTILE_SECRET_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  GEMINI_ENDPOINT: string;
  BENCHMARK_EXECUTION_PROVIDER: string;
  BENCHMARK_EXECUTION_API_KEY: string;
  BENCHMARK_EXECUTION_MODEL: string;
  BENCHMARK_EXECUTION_ENABLED_MODELS?: string;
  BENCHMARK_EXECUTION_ENDPOINT: string;
  GITHUB_APP_INSTALL_URL?: string;
  STARTUP_DASHBOARD_ENABLED?: string;
  STARTUP_GITHUB_AGENT_ENABLED?: string;
  STARTUP_AUTO_PR_ENABLED?: string;
};

export type PaymentApiEnv = ScanApiEnv & {
  SCAN_QUEUE: Queue | undefined;
  DISTRIBUTION_QUEUE?: Queue | undefined;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID_DEEP_AUDIT: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
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
  X_OAUTH_CLIENT_ID?: string;
  X_OAUTH_CLIENT_SECRET?: string;
  X_OAUTH_TOKEN_URL?: string;
  LINKEDIN_OAUTH_CLIENT_ID?: string;
  LINKEDIN_OAUTH_CLIENT_SECRET?: string;
  LINKEDIN_OAUTH_TOKEN_URL?: string;
  NEXT_PUBLIC_APP_URL: string;
  /** Set via wrangler secret / .dev.vars — required for POST /api/admin/reconcile-deep-audit */
  RECONCILE_SECRET: string;
  /** Plaintext var: default `page_limit` for new `scan_runs` on paid deep audit (1–1000). */
  DEEP_AUDIT_DEFAULT_PAGE_LIMIT: string;
  /** Plaintext var: off, auto, or force for optional Browser Rendering on paid deep audits. */
  DEEP_AUDIT_BROWSER_RENDER_MODE: string;
  DEEP_AUDIT_INTERNAL_REWRITE_ENABLED: string;
  DEEP_AUDIT_INTERNAL_REWRITE_MODEL: string;
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
    TURNSTILE_SECRET_KEY: String(e['TURNSTILE_SECRET_KEY'] ?? ''),
    GEMINI_API_KEY: String(e['GEMINI_API_KEY'] ?? ''),
    GEMINI_MODEL: String(e['GEMINI_MODEL'] ?? 'gemini-2.0-flash'),
    GEMINI_ENDPOINT: String(
      e['GEMINI_ENDPOINT'] ?? 'https://generativelanguage.googleapis.com/v1beta/models'
    ),
    BENCHMARK_EXECUTION_PROVIDER: String(e['BENCHMARK_EXECUTION_PROVIDER'] ?? ''),
    BENCHMARK_EXECUTION_API_KEY: String(e['BENCHMARK_EXECUTION_API_KEY'] ?? ''),
    BENCHMARK_EXECUTION_MODEL: String(e['BENCHMARK_EXECUTION_MODEL'] ?? ''),
    BENCHMARK_EXECUTION_ENABLED_MODELS: String(e['BENCHMARK_EXECUTION_ENABLED_MODELS'] ?? ''),
    BENCHMARK_EXECUTION_ENDPOINT: String(e['BENCHMARK_EXECUTION_ENDPOINT'] ?? ''),
    GITHUB_APP_INSTALL_URL: String(e['GITHUB_APP_INSTALL_URL'] ?? ''),
    STARTUP_DASHBOARD_ENABLED: String(e['STARTUP_DASHBOARD_ENABLED'] ?? ''),
    STARTUP_GITHUB_AGENT_ENABLED: String(e['STARTUP_GITHUB_AGENT_ENABLED'] ?? ''),
    STARTUP_AUTO_PR_ENABLED: String(e['STARTUP_AUTO_PR_ENABLED'] ?? ''),
  };
}

export async function getScanApiEnv(): Promise<ScanApiEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return readEnvRecord(env as unknown as Record<string, unknown>);
  } catch {
    return {
      SCAN_CACHE: undefined,
      NEXT_PUBLIC_APP_URL: process.env['NEXT_PUBLIC_APP_URL'] ?? '',
      NEXT_PUBLIC_SUPABASE_URL: process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
      SUPABASE_SERVICE_ROLE_KEY: process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
      DISTRIBUTION_ENGINE_UI_ENABLED: process.env['DISTRIBUTION_ENGINE_UI_ENABLED'] ?? '',
      DISTRIBUTION_ENGINE_WRITE_ENABLED: process.env['DISTRIBUTION_ENGINE_WRITE_ENABLED'] ?? '',
      DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED:
        process.env['DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED'] ?? '',
      DISTRIBUTION_ENGINE_BACKGROUND_ENABLED:
        process.env['DISTRIBUTION_ENGINE_BACKGROUND_ENABLED'] ?? '',
      DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT:
        process.env['DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT'] ?? '',
      TURNSTILE_SECRET_KEY: process.env['TURNSTILE_SECRET_KEY'] ?? '',
      GEMINI_API_KEY: process.env['GEMINI_API_KEY'] ?? '',
      GEMINI_MODEL: process.env['GEMINI_MODEL'] ?? 'gemini-2.0-flash',
      GEMINI_ENDPOINT:
        process.env['GEMINI_ENDPOINT'] ??
        'https://generativelanguage.googleapis.com/v1beta/models',
      BENCHMARK_EXECUTION_PROVIDER: process.env['BENCHMARK_EXECUTION_PROVIDER'] ?? '',
      BENCHMARK_EXECUTION_API_KEY: process.env['BENCHMARK_EXECUTION_API_KEY'] ?? '',
      BENCHMARK_EXECUTION_MODEL: process.env['BENCHMARK_EXECUTION_MODEL'] ?? '',
      BENCHMARK_EXECUTION_ENABLED_MODELS:
        process.env['BENCHMARK_EXECUTION_ENABLED_MODELS'] ?? '',
      BENCHMARK_EXECUTION_ENDPOINT: process.env['BENCHMARK_EXECUTION_ENDPOINT'] ?? '',
      GITHUB_APP_INSTALL_URL: process.env['GITHUB_APP_INSTALL_URL'] ?? '',
      STARTUP_DASHBOARD_ENABLED: process.env['STARTUP_DASHBOARD_ENABLED'] ?? '',
      STARTUP_GITHUB_AGENT_ENABLED: process.env['STARTUP_GITHUB_AGENT_ENABLED'] ?? '',
      STARTUP_AUTO_PR_ENABLED: process.env['STARTUP_AUTO_PR_ENABLED'] ?? '',
    };
  }
}

export async function getPaymentApiEnv(): Promise<PaymentApiEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as Record<string, unknown>;
    const base = readEnvRecord(e);
    return {
      ...base,
      SCAN_QUEUE: resolveScanQueue(e),
      DISTRIBUTION_QUEUE: resolveQueueBinding(e, 'DISTRIBUTION_QUEUE'),
      STRIPE_SECRET_KEY: pickEnvString(e, 'STRIPE_SECRET_KEY'),
      STRIPE_WEBHOOK_SECRET: pickEnvString(e, 'STRIPE_WEBHOOK_SECRET'),
      STRIPE_PRICE_ID_DEEP_AUDIT: pickEnvString(e, 'STRIPE_PRICE_ID_DEEP_AUDIT'),
      RESEND_API_KEY: pickEnvString(e, 'RESEND_API_KEY'),
      RESEND_FROM_EMAIL: pickEnvString(e, 'RESEND_FROM_EMAIL'),
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
      X_OAUTH_CLIENT_ID: pickEnvString(e, 'X_OAUTH_CLIENT_ID'),
      X_OAUTH_CLIENT_SECRET: pickEnvString(e, 'X_OAUTH_CLIENT_SECRET'),
      X_OAUTH_TOKEN_URL: pickEnvString(e, 'X_OAUTH_TOKEN_URL'),
      LINKEDIN_OAUTH_CLIENT_ID: pickEnvString(e, 'LINKEDIN_OAUTH_CLIENT_ID'),
      LINKEDIN_OAUTH_CLIENT_SECRET: pickEnvString(e, 'LINKEDIN_OAUTH_CLIENT_SECRET'),
      LINKEDIN_OAUTH_TOKEN_URL: pickEnvString(e, 'LINKEDIN_OAUTH_TOKEN_URL'),
      NEXT_PUBLIC_APP_URL: pickEnvString(e, 'NEXT_PUBLIC_APP_URL'),
      RECONCILE_SECRET: pickEnvString(e, 'RECONCILE_SECRET'),
      DEEP_AUDIT_DEFAULT_PAGE_LIMIT: pickEnvString(e, 'DEEP_AUDIT_DEFAULT_PAGE_LIMIT'),
      DEEP_AUDIT_BROWSER_RENDER_MODE: pickEnvString(e, 'DEEP_AUDIT_BROWSER_RENDER_MODE'),
      DEEP_AUDIT_INTERNAL_REWRITE_ENABLED: pickEnvString(e, 'DEEP_AUDIT_INTERNAL_REWRITE_ENABLED'),
      DEEP_AUDIT_INTERNAL_REWRITE_MODEL: pickEnvString(e, 'DEEP_AUDIT_INTERNAL_REWRITE_MODEL'),
    };
  } catch {
    return {
      ...(await getScanApiEnv()),
      SCAN_QUEUE: undefined,
      DISTRIBUTION_QUEUE: undefined,
      STRIPE_SECRET_KEY: process.env['STRIPE_SECRET_KEY'] ?? '',
      STRIPE_WEBHOOK_SECRET: process.env['STRIPE_WEBHOOK_SECRET'] ?? '',
      STRIPE_PRICE_ID_DEEP_AUDIT: process.env['STRIPE_PRICE_ID_DEEP_AUDIT'] ?? '',
      RESEND_API_KEY: process.env['RESEND_API_KEY'] ?? '',
      RESEND_FROM_EMAIL: process.env['RESEND_FROM_EMAIL'] ?? '',
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
      X_OAUTH_CLIENT_ID: process.env['X_OAUTH_CLIENT_ID'] ?? '',
      X_OAUTH_CLIENT_SECRET: process.env['X_OAUTH_CLIENT_SECRET'] ?? '',
      X_OAUTH_TOKEN_URL: process.env['X_OAUTH_TOKEN_URL'] ?? '',
      LINKEDIN_OAUTH_CLIENT_ID: process.env['LINKEDIN_OAUTH_CLIENT_ID'] ?? '',
      LINKEDIN_OAUTH_CLIENT_SECRET: process.env['LINKEDIN_OAUTH_CLIENT_SECRET'] ?? '',
      LINKEDIN_OAUTH_TOKEN_URL: process.env['LINKEDIN_OAUTH_TOKEN_URL'] ?? '',
      NEXT_PUBLIC_APP_URL: process.env['NEXT_PUBLIC_APP_URL'] ?? '',
      RECONCILE_SECRET: process.env['RECONCILE_SECRET'] ?? '',
      DEEP_AUDIT_DEFAULT_PAGE_LIMIT: process.env['DEEP_AUDIT_DEFAULT_PAGE_LIMIT'] ?? '',
      DEEP_AUDIT_BROWSER_RENDER_MODE: process.env['DEEP_AUDIT_BROWSER_RENDER_MODE'] ?? '',
      DEEP_AUDIT_INTERNAL_REWRITE_ENABLED:
        process.env['DEEP_AUDIT_INTERNAL_REWRITE_ENABLED'] ?? '',
      DEEP_AUDIT_INTERNAL_REWRITE_MODEL:
        process.env['DEEP_AUDIT_INTERNAL_REWRITE_MODEL'] ?? '',
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


