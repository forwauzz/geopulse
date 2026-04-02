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
import { buildTopicPageStructuredData } from '@/lib/server/content-structured-data';
import { getTopicPageContent } from '@/lib/server/content-topic-pages';
import { createPublicContentData } from '@/lib/server/public-content-data';

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

  return {
    title: `${group.topicLabel} | GEO-Pulse Blog`,
    description: `Published GEO-Pulse articles about ${group.topicLabel}.`,
    alternates: {
      canonical: toAbsoluteUrl(env.NEXT_PUBLIC_APP_URL, buildTopicHref(group.topicKey)),
    },
  };
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

  return (
    <main className="mx-auto max-w-7xl px-6 py-16 md:px-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="max-w-3xl">
        <Link
          href="/blog"
          className="font-label text-xs font-semibold uppercase tracking-widest text-primary"
        >
          Back to blog
        </Link>
        <p className="mt-6 font-label text-sm font-semibold uppercase tracking-widest text-primary">
          Topic cluster
        </p>
        <h1 className="mt-3 font-headline text-4xl font-bold text-on-background md:text-5xl">
          {group.topicLabel}
        </h1>
        <p className="mt-4 font-body text-lg leading-relaxed text-on-surface-variant">
          {topicContent.definition}
        </p>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-surface-container-low p-6 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-primary">Definition</p>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
            {topicContent.definition}
          </p>
        </div>
        <div className="rounded-2xl bg-surface-container-low p-6 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-primary">Why It Matters</p>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
            {topicContent.whyItMatters}
          </p>
        </div>
        <div className="rounded-2xl bg-surface-container-low p-6 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-primary">
            Practical takeaway
          </p>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
            {topicContent.practicalTakeaway}
          </p>
        </div>
      </section>

      <div className="mt-4 rounded-2xl bg-surface-container-low p-6 shadow-float">
        <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
          Cluster summary
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-on-surface-variant">
          This topic page exists so the GEO-Pulse blog has a stable cluster URL with a clear
          definition, a bounded explanation of why the topic matters, and direct paths into the
          supporting canonical articles.
        </p>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-2xl bg-surface-container-low p-6 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-primary">Browse topics</p>
            <ul className="mt-4 space-y-3 text-sm">
              {topicGroups.map((topicGroup) => (
                <li key={topicGroup.topicKey}>
                  <Link
                    href={buildTopicHref(topicGroup.topicKey)}
                    className={
                      topicGroup.topicKey === group.topicKey
                        ? 'text-primary'
                        : 'text-on-background hover:text-primary'
                    }
                  >
                    {topicGroup.topicLabel}
                  </Link>
                  <p className="mt-1 text-xs text-on-surface-variant">
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
              className="overflow-hidden rounded-2xl bg-surface-container-lowest shadow-float"
            >
              {(() => {
                const articleMetadata = parseArticleMetadata(article.metadata);
                return articleMetadata.heroImageUrl ? (
                  <div className="aspect-[16/8] w-full overflow-hidden bg-surface-container-low">
                    <img
                      src={articleMetadata.heroImageUrl}
                      alt={articleMetadata.heroImageAlt ?? article.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null;
              })()}
              <div className="p-8">
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-widest text-on-surface-variant">
                <span>{formatDate(article.published_at)}</span>
                <span>&bull;</span>
                <span>{article.target_persona ?? '-'}</span>
              </div>
              <h2 className="mt-4 font-headline text-3xl font-bold text-on-background">
                <Link href={`/blog/${article.slug}`} className="hover:text-primary">
                  {article.title}
                </Link>
              </h2>
              {article.primary_problem ? (
                <p className="mt-3 font-body text-sm font-medium text-on-background">
                  Problem: {article.primary_problem}
                </p>
              ) : null}
              {article.excerpt ? (
                <p className="mt-4 max-w-3xl font-body leading-relaxed text-on-surface-variant">
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
