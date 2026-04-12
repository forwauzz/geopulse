import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  buildTopicHref,
  getArticlesForTopic,
  groupArticlesByTopic,
} from '@/lib/server/content-navigation';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { parseArticleMetadata } from '@/lib/server/content-article-metadata';
import { createPublicContentClient } from '@/lib/server/public-content-client';
import {
  buildBreadcrumbStructuredData,
  buildTopicPageStructuredData,
} from '@/lib/server/content-structured-data';
import { getTopicPageContent } from '@/lib/server/content-topic-pages';
import { createPublicContentData } from '@/lib/server/public-content-data';
import { buildPublicPageMetadata } from '@/lib/server/public-site-seo';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ topic: string }>;
};

function formatDate(value: string | null): string {
  if (!value) return 'Unscheduled';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function toAbsoluteUrl(appUrl: string, pathOrUrl: string): string {
  const base = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

async function loadArticles() {
  const supabase = await createPublicContentClient();
  return createPublicContentData(supabase).getPublishedArticles();
}

async function loadTopicPageMetadata(topic: string): Promise<Record<string, unknown> | null> {
  const supabase = await createPublicContentClient();
  const { data, error } = await supabase
    .from('content_items')
    .select('metadata')
    .eq('content_type', 'research_note')
    .eq('status', 'published')
    .eq('topic_cluster', topic)
    .eq('slug', `topic-${topic}`)
    .maybeSingle();

  if (error) throw error;
  const row = data as { metadata?: Record<string, unknown> | null } | null;
  return row?.metadata ?? null;
}

function readTopicPageField(
  metadata: Record<string, unknown> | null,
  key: 'topic_page_definition' | 'topic_page_why_it_matters' | 'topic_page_practical_takeaway',
  fallback: string
): string {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { topic } = await params;
  const articles = await loadArticles();
  const topicGroups = groupArticlesByTopic(articles);
  const group = topicGroups.find((item) => item.topicKey === topic);
  const env = await getPaymentApiEnv();

  if (!group) {
    return {
      title: 'Topic not found | GEO-Pulse',
    };
  }

  return buildPublicPageMetadata({
    baseUrl: env.NEXT_PUBLIC_APP_URL,
    title: `${group.topicLabel} | GEO-Pulse Blog`,
    description: `Published GEO-Pulse articles about ${group.topicLabel}.`,
    canonicalPath: buildTopicHref(group.topicKey),
    openGraphType: 'website',
  });
}

export default async function BlogTopicPage({ params }: Props) {
  const { topic } = await params;
  const articles = await loadArticles();
  const topicGroups = groupArticlesByTopic(articles);
  const group = topicGroups.find((item) => item.topicKey === topic);
  if (!group) notFound();

  const [topicMetadata, env] = await Promise.all([
    loadTopicPageMetadata(group.topicKey),
    getPaymentApiEnv(),
  ]);
  const topicArticles = getArticlesForTopic(articles, topic);
  const fallbackTopicContent = getTopicPageContent(group.topicKey);
  const topicContent = {
    definition: readTopicPageField(
      topicMetadata,
      'topic_page_definition',
      fallbackTopicContent.definition
    ),
    whyItMatters: readTopicPageField(
      topicMetadata,
      'topic_page_why_it_matters',
      fallbackTopicContent.whyItMatters
    ),
    practicalTakeaway: readTopicPageField(
      topicMetadata,
      'topic_page_practical_takeaway',
      fallbackTopicContent.practicalTakeaway
    ),
  };
  const topicUrl = toAbsoluteUrl(env.NEXT_PUBLIC_APP_URL, buildTopicHref(group.topicKey));
  const structuredData = buildTopicPageStructuredData({
    topicLabel: group.topicLabel,
    topicUrl,
    definition: topicContent.definition,
    whyItMatters: topicContent.whyItMatters,
    articleUrls: topicArticles.map((article) =>
      toAbsoluteUrl(env.NEXT_PUBLIC_APP_URL, `/blog/${article.slug}`)
    ),
  });
  const breadcrumbStructuredData = buildBreadcrumbStructuredData([
    { name: 'Blog', item: toAbsoluteUrl(env.NEXT_PUBLIC_APP_URL, '/blog') },
    { name: group.topicLabel, item: topicUrl },
  ]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-16 md:px-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData) }}
      />
      <div className="max-w-3xl">
        <nav aria-label="Breadcrumb" className="font-label text-xs uppercase tracking-widest">
          <ol className="flex flex-wrap items-center gap-2 text-zinc-300">
            <li>
              <Link href="/blog" className="text-sky-300 hover:text-sky-200 hover:underline">
                Blog
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-white">{group.topicLabel}</li>
          </ol>
        </nav>
        <p className="mt-6 font-label text-sm font-semibold uppercase tracking-widest text-sky-300">
          Topic cluster
        </p>
        <h1 className="mt-3 font-headline text-4xl font-bold text-white md:text-5xl">
          {group.topicLabel}
        </h1>
        <p className="mt-4 font-body text-lg leading-relaxed text-zinc-300">
          {topicContent.definition}
        </p>
        <p className="mt-3 font-body text-sm text-zinc-300">
          Topic pages are maintained as part of the canonical public site, with clear authorship and
          an{' '}
          <Link href="/about" className="font-semibold text-sky-300 hover:underline">
            About page
          </Link>
          .
        </p>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-zinc-900 p-6 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-sky-300">Definition</p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            {topicContent.definition}
          </p>
        </div>
        <div className="rounded-2xl bg-zinc-900 p-6 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-sky-300">Why It Matters</p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            {topicContent.whyItMatters}
          </p>
        </div>
        <div className="rounded-2xl bg-zinc-900 p-6 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-sky-300">
            Practical takeaway
          </p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            {topicContent.practicalTakeaway}
          </p>
        </div>
      </section>

      <div className="mt-4 rounded-2xl bg-zinc-900 p-6 shadow-float">
        <p className="font-label text-xs uppercase tracking-widest text-zinc-300">
          Cluster summary
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-300">
          This topic page exists so the GEO-Pulse blog has a stable cluster URL with a clear
          definition, a bounded explanation of why the topic matters, and direct paths into the
          supporting canonical articles.
        </p>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-2xl bg-zinc-900 p-6 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-sky-300">Browse topics</p>
            <ul className="mt-4 space-y-3 text-sm">
              {topicGroups.map((topicGroup) => (
                <li key={topicGroup.topicKey}>
                  <Link
                    href={buildTopicHref(topicGroup.topicKey)}
                    className={
                      topicGroup.topicKey === group.topicKey
                        ? 'text-sky-300'
                        : 'text-white hover:text-sky-300'
                    }
                  >
                    {topicGroup.topicLabel}
                  </Link>
                  <p className="mt-1 text-xs text-zinc-300">
                    {topicGroup.articles.length} article{topicGroup.articles.length === 1 ? '' : 's'}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <section className="grid gap-6">
          {topicArticles.map((article) => (
            <article
              key={article.content_id}
              className="overflow-hidden rounded-2xl bg-zinc-950 shadow-float"
            >
              {(() => {
                const articleMetadata = parseArticleMetadata(article.metadata);
                return articleMetadata.heroImageUrl ? (
                  <div className="aspect-[16/8] w-full overflow-hidden bg-zinc-900">
                    <img
                      src={articleMetadata.heroImageUrl}
                      alt={articleMetadata.heroImageAlt ?? article.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null;
              })()}
              <div className="p-8">
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-widest text-zinc-300">
                <span>{formatDate(article.published_at)}</span>
                <span>&bull;</span>
                <span>{article.target_persona ?? '-'}</span>
              </div>
              <h2 className="mt-4 font-headline text-3xl font-bold text-white">
                <Link href={`/blog/${article.slug}`} className="hover:text-sky-300">
                  {article.title}
                </Link>
              </h2>
              {article.primary_problem ? (
                <p className="mt-3 font-body text-sm font-medium text-white">
                  Problem: {article.primary_problem}
                </p>
              ) : null}
              {article.excerpt ? (
                <p className="mt-4 max-w-3xl font-body leading-relaxed text-zinc-300">
                  {article.excerpt}
                </p>
              ) : null}
              <div className="mt-6">
                <Link
                  href={`/blog/${article.slug}`}
                  className="inline-flex rounded-xl bg-primary px-4 py-2 font-body text-sm font-semibold text-on-primary transition hover:opacity-90"
                >
                  Read article
                </Link>
              </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}


