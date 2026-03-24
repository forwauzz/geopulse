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
};

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
      SCAN_QUEUE: e['SCAN_QUEUE'] as Queue | undefined,
      STRIPE_SECRET_KEY: String(e['STRIPE_SECRET_KEY'] ?? ''),
      STRIPE_WEBHOOK_SECRET: String(e['STRIPE_WEBHOOK_SECRET'] ?? ''),
      STRIPE_PRICE_ID_DEEP_AUDIT: String(e['STRIPE_PRICE_ID_DEEP_AUDIT'] ?? ''),
      RESEND_API_KEY: String(e['RESEND_API_KEY'] ?? ''),
      RESEND_FROM_EMAIL: String(e['RESEND_FROM_EMAIL'] ?? ''),
      NEXT_PUBLIC_APP_URL: String(e['NEXT_PUBLIC_APP_URL'] ?? ''),
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
