import type { Metadata } from 'next';
import { ResultsView } from '@/components/results-view';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { getScanForPublicShare } from '@/lib/server/get-scan-for-public-share';
import { getTurnstileSiteKey } from '@/lib/turnstile-site-key';

type PageProps = { params: Promise<{ id: string }>; searchParams?: Promise<{ checkout?: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const titleBase = 'Scan results | GEO-Pulse';
  const description = 'AI Search Readiness audit for your site.';

  try {
    const env = await getScanApiEnv();
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return {
        title: titleBase,
        description,
        openGraph: { title: titleBase, description, type: 'website' },
        twitter: { card: 'summary', title: titleBase, description },
      };
    }
    const result = await getScanForPublicShare(
      id,
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!result.ok) {
      return {
        title: titleBase,
        description,
        openGraph: { title: titleBase, description, type: 'website' },
        twitter: { card: 'summary', title: titleBase, description },
      };
    }
    const { url, score } = result.data;
    const scorePart = score != null ? `${score} — ` : '';
    const title = `${scorePart}${titleBase}`;
    const desc = `Results for ${url}`;
    return {
      title,
      description: desc,
      openGraph: { title, description: desc, type: 'website' },
      twitter: { card: 'summary', title, description: desc },
    };
  } catch {
    return {
      title: titleBase,
      description,
      openGraph: { title: titleBase, description, type: 'website' },
      twitter: { card: 'summary', title: titleBase, description },
    };
  }
}

export default async function ResultsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const siteKey = getTurnstileSiteKey();

  return (
    <main className="mx-auto max-w-7xl px-6 py-12 md:px-10 md:py-16">
      <ResultsView scanId={id} turnstileSiteKey={siteKey} checkoutState={query?.checkout ?? null} />
    </main>
  );
}
