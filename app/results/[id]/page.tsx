import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CheckoutStatusBanner } from '@/components/checkout-status-banner';
import { ResultsView } from '@/components/results-view';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { getScanForPublicShare } from '@/lib/server/get-scan-for-public-share';

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const titleBase = 'Scan results | GEO-Pulse';
  const description = 'AI Search Readiness audit for your site.';

  try {
    const env = await getScanApiEnv();
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return { title: titleBase, description };
    }
    const result = await getScanForPublicShare(
      id,
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!result.ok) {
      return { title: titleBase, description };
    }
    const { url, score } = result.data;
    const scorePart = score != null ? `${score} — ` : '';
    return {
      title: `${scorePart}${titleBase}`,
      description: `Results for ${url}`,
    };
  } catch {
    return { title: titleBase, description };
  }
}

export default async function ResultsPage({ params }: PageProps) {
  const { id } = await params;
  const siteKey = process.env['NEXT_PUBLIC_TURNSTILE_SITE_KEY'] ?? '';

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-16">
      <Suspense fallback={null}>
        <CheckoutStatusBanner />
      </Suspense>
      <ResultsView scanId={id} turnstileSiteKey={siteKey} />
    </main>
  );
}
