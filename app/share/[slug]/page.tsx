import type { Metadata } from 'next';
import { ResultsView } from '@/components/results-view';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { getScanForShareSlug } from '@/lib/server/get-scan-for-public-share';
import { getTurnstileSiteKey } from '@/lib/turnstile-site-key';
import { loadUiFlags } from '@/lib/server/app-ui-flags';

type PageProps = { params: Promise<{ slug: string }> };

const titleBase = 'Scan results | GEO-Pulse';
const description = 'AI Search Readiness audit for your site.';

function fallbackMetadata(): Metadata {
  return {
    title: titleBase,
    description,
    openGraph: { title: titleBase, description, type: 'website' },
    twitter: { card: 'summary', title: titleBase, description },
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const env = await getScanApiEnv();
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return fallbackMetadata();
    }
    const result = await getScanForShareSlug(
      slug,
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!result.ok) {
      return fallbackMetadata();
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
    return fallbackMetadata();
  }
}

export default async function SharePage({ params }: PageProps) {
  const { slug } = await params;
  const siteKey = getTurnstileSiteKey();
  const showCompetitorSearch = (await loadUiFlags()).show_competitor_search;

  return (
    <main className="mx-auto max-w-7xl px-6 py-12 md:px-10 md:py-16">
      <ResultsView
        scanId=""
        shareSlug={slug}
        turnstileSiteKey={siteKey}
        showCompetitorSearch={showCompetitorSearch}
      />
    </main>
  );
}
