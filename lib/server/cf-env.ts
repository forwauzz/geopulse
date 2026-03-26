/**
 * Resolve Cloudflare bindings for API routes (OpenNext + wrangler dev).
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';

export type ScanApiEnv = {
  SCAN_CACHE: KVNamespace | undefined;
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  GEMINI_ENDPOINT: string;
};

export type PaymentApiEnv = ScanApiEnv & {
  SCAN_QUEUE: Queue | undefined;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID_DEEP_AUDIT: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  NEXT_PUBLIC_APP_URL: string;
  /** Set via wrangler secret / .dev.vars — required for POST /api/admin/reconcile-deep-audit */
  RECONCILE_SECRET: string;
  /** Plaintext var: default `page_limit` for new `scan_runs` on paid deep audit (1–120). */
  DEEP_AUDIT_DEFAULT_PAGE_LIMIT: string;
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

function readEnvRecord(e: Record<string, unknown>): ScanApiEnv {
  return {
    SCAN_CACHE: e['SCAN_CACHE'] as KVNamespace | undefined,
    NEXT_PUBLIC_SUPABASE_URL: String(e['NEXT_PUBLIC_SUPABASE_URL'] ?? ''),
    SUPABASE_SERVICE_ROLE_KEY: String(e['SUPABASE_SERVICE_ROLE_KEY'] ?? ''),
    TURNSTILE_SECRET_KEY: String(e['TURNSTILE_SECRET_KEY'] ?? ''),
    GEMINI_API_KEY: String(e['GEMINI_API_KEY'] ?? ''),
    GEMINI_MODEL: String(e['GEMINI_MODEL'] ?? 'gemini-2.0-flash'),
    GEMINI_ENDPOINT: String(
      e['GEMINI_ENDPOINT'] ?? 'https://generativelanguage.googleapis.com/v1beta/models'
    ),
  };
}

export async function getScanApiEnv(): Promise<ScanApiEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return readEnvRecord(env as unknown as Record<string, unknown>);
  } catch {
    return {
      SCAN_CACHE: undefined,
      NEXT_PUBLIC_SUPABASE_URL: process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
      SUPABASE_SERVICE_ROLE_KEY: process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
      TURNSTILE_SECRET_KEY: process.env['TURNSTILE_SECRET_KEY'] ?? '',
      GEMINI_API_KEY: process.env['GEMINI_API_KEY'] ?? '',
      GEMINI_MODEL: process.env['GEMINI_MODEL'] ?? 'gemini-2.0-flash',
      GEMINI_ENDPOINT:
        process.env['GEMINI_ENDPOINT'] ??
        'https://generativelanguage.googleapis.com/v1beta/models',
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
      STRIPE_SECRET_KEY: pickEnvString(e, 'STRIPE_SECRET_KEY'),
      STRIPE_WEBHOOK_SECRET: pickEnvString(e, 'STRIPE_WEBHOOK_SECRET'),
      STRIPE_PRICE_ID_DEEP_AUDIT: pickEnvString(e, 'STRIPE_PRICE_ID_DEEP_AUDIT'),
      RESEND_API_KEY: pickEnvString(e, 'RESEND_API_KEY'),
      RESEND_FROM_EMAIL: pickEnvString(e, 'RESEND_FROM_EMAIL'),
      NEXT_PUBLIC_APP_URL: pickEnvString(e, 'NEXT_PUBLIC_APP_URL'),
      RECONCILE_SECRET: pickEnvString(e, 'RECONCILE_SECRET'),
      DEEP_AUDIT_DEFAULT_PAGE_LIMIT: pickEnvString(e, 'DEEP_AUDIT_DEFAULT_PAGE_LIMIT'),
    };
  } catch {
    return {
      ...(await getScanApiEnv()),
      SCAN_QUEUE: undefined,
      STRIPE_SECRET_KEY: process.env['STRIPE_SECRET_KEY'] ?? '',
      STRIPE_WEBHOOK_SECRET: process.env['STRIPE_WEBHOOK_SECRET'] ?? '',
      STRIPE_PRICE_ID_DEEP_AUDIT: process.env['STRIPE_PRICE_ID_DEEP_AUDIT'] ?? '',
      RESEND_API_KEY: process.env['RESEND_API_KEY'] ?? '',
      RESEND_FROM_EMAIL: process.env['RESEND_FROM_EMAIL'] ?? '',
      NEXT_PUBLIC_APP_URL: process.env['NEXT_PUBLIC_APP_URL'] ?? '',
      RECONCILE_SECRET: process.env['RECONCILE_SECRET'] ?? '',
      DEEP_AUDIT_DEFAULT_PAGE_LIMIT: process.env['DEEP_AUDIT_DEFAULT_PAGE_LIMIT'] ?? '',
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
