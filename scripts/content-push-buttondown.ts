import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createContentAdminData } from '@/lib/server/content-admin-data';
import { createContentDestinationAdminData } from '@/lib/server/content-destination-admin-data';
import { resolveContentDestinationAdapter } from '@/lib/server/content-destination-adapters';
import type { PaymentApiEnv } from '@/lib/server/cf-env';

function readRequiredEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

function buildEnv(): PaymentApiEnv {
  return {
    SCAN_CACHE: undefined,
    NEXT_PUBLIC_SUPABASE_URL: readRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: readRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    DISTRIBUTION_ENGINE_UI_ENABLED: process.env['DISTRIBUTION_ENGINE_UI_ENABLED'] ?? '',
    DISTRIBUTION_ENGINE_WRITE_ENABLED: process.env['DISTRIBUTION_ENGINE_WRITE_ENABLED'] ?? '',
    TURNSTILE_SECRET_KEY: process.env['TURNSTILE_SECRET_KEY'] ?? '',
    GEMINI_API_KEY: process.env['GEMINI_API_KEY'] ?? '',
    GEMINI_MODEL: process.env['GEMINI_MODEL'] ?? '',
    GEMINI_ENDPOINT: process.env['GEMINI_ENDPOINT'] ?? '',
    BENCHMARK_EXECUTION_PROVIDER: process.env['BENCHMARK_EXECUTION_PROVIDER'] ?? '',
    BENCHMARK_EXECUTION_API_KEY: process.env['BENCHMARK_EXECUTION_API_KEY'] ?? '',
    BENCHMARK_EXECUTION_MODEL: process.env['BENCHMARK_EXECUTION_MODEL'] ?? '',
    BENCHMARK_EXECUTION_ENABLED_MODELS: process.env['BENCHMARK_EXECUTION_ENABLED_MODELS'] ?? '',
    BENCHMARK_EXECUTION_ENDPOINT: process.env['BENCHMARK_EXECUTION_ENDPOINT'] ?? '',
    SCAN_QUEUE: undefined,
    STRIPE_SECRET_KEY: process.env['STRIPE_SECRET_KEY'] ?? '',
    STRIPE_WEBHOOK_SECRET: process.env['STRIPE_WEBHOOK_SECRET'] ?? '',
    STRIPE_PRICE_ID_DEEP_AUDIT: process.env['STRIPE_PRICE_ID_DEEP_AUDIT'] ?? '',
    RESEND_API_KEY: process.env['RESEND_API_KEY'] ?? '',
    RESEND_FROM_EMAIL: process.env['RESEND_FROM_EMAIL'] ?? '',
    KIT_API_KEY: process.env['KIT_API_KEY'] ?? '',
    BUTTONDOWN_API_KEY: readRequiredEnv('BUTTONDOWN_API_KEY'),
    GHOST_ADMIN_API_URL: process.env['GHOST_ADMIN_API_URL'] ?? '',
    GHOST_ADMIN_API_KEY: process.env['GHOST_ADMIN_API_KEY'] ?? '',
    GHOST_ADMIN_API_VERSION: process.env['GHOST_ADMIN_API_VERSION'] ?? '',
    NEXT_PUBLIC_APP_URL: process.env['NEXT_PUBLIC_APP_URL'] ?? '',
    RECONCILE_SECRET: process.env['RECONCILE_SECRET'] ?? '',
    DEEP_AUDIT_DEFAULT_PAGE_LIMIT: process.env['DEEP_AUDIT_DEFAULT_PAGE_LIMIT'] ?? '',
    DEEP_AUDIT_BROWSER_RENDER_MODE: process.env['DEEP_AUDIT_BROWSER_RENDER_MODE'] ?? '',
    DEEP_AUDIT_INTERNAL_REWRITE_ENABLED: process.env['DEEP_AUDIT_INTERNAL_REWRITE_ENABLED'] ?? '',
    DEEP_AUDIT_INTERNAL_REWRITE_MODEL: process.env['DEEP_AUDIT_INTERNAL_REWRITE_MODEL'] ?? '',
  };
}

async function main() {
  const env = buildEnv();
  const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const contentId = process.argv[2]?.trim() || 'ai-search-readiness-audit-newsletter';

  const item = await createContentAdminData(supabase).getContentItemDetail(contentId);
  if (!item) {
    throw new Error(`Content item not found: ${contentId}`);
  }

  const destinations = await createContentDestinationAdminData(supabase).getDestinations();
  const destination = destinations.find((row) => row.destination_key === 'buttondown_newsletter');
  if (!destination) {
    throw new Error('Buttondown destination record not found. Apply migration 018 first.');
  }

  const adapter = resolveContentDestinationAdapter(destination);
  const result = await adapter.publishDraft({
    item,
    destination,
    env,
  });

  const { error } = await supabase.from('content_distribution_deliveries').insert({
    content_item_id: item.id,
    destination_type: destination.destination_type,
    destination_name: destination.provider_name,
    status: result.status,
    destination_post_id: result.providerPublicationId,
    destination_url: result.destinationUrl,
    metadata: result.metadata,
    published_at: result.status === 'published' ? new Date().toISOString() : null,
  });

  if (error) {
    throw error;
  }

  console.log(
    JSON.stringify(
      {
        contentId: item.content_id,
        destination: destination.destination_key,
        providerPublicationId: result.providerPublicationId,
        destinationUrl: result.destinationUrl,
        status: result.status,
        metadata: result.metadata,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
