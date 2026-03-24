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

export async function getScanApiEnv(): Promise<ScanApiEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as Record<string, unknown>;
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

export function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}
