import type { Metadata } from 'next';
import Link from 'next/link';
import { BlogEditorsChoice } from '@/components/blog/blog-editors-choice';
import { BlogFeedCard } from '@/components/blog/blog-feed-card';
import { BlogHeroCard } from '@/components/blog/blog-hero-card';
import { BlogPagination } from '@/components/blog/blog-pagination';
import { BlogPromoStrip } from '@/components/blog/blog-promo-strip';
import { BlogSubBar } from '@/components/blog/blog-sub-bar';
import { BlogTopicColumns } from '@/components/blog/blog-topic-columns';
import { EDITORS_CHOICE_SLUGS } from '@/lib/blog/editors-choice';
import { estimateReadMinutes } from '@/lib/blog/read-time';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { buildTopicAnchor, buildTopicHref, groupArticlesByTopic } from '@/lib/server/content-navigation';
import { parseArticleMetadata } from '@/lib/server/content-article-metadata';
import {
  buildBlogIndexStructuredData,
  buildBreadcrumbStructuredData,
} from '@/lib/server/content-structured-data';
import { createPublicContentClient } from '@/lib/server/public-content-client';
import { createPublicContentData } from '@/lib/server/public-content-data';
import type { PublicContentListRow } from '@/lib/server/public-content-data';
import {
  buildPublicPageMetadata,
  SITE_AUTHOR_NAME,
  SITE_AUTHOR_URL_PATH,
  SITE_DESCRIPTION,
  SITE_EDITORIAL_NAME,
} from '@/lib/server/public-site-seo';

export const dynamic = 'force-dynamic';

const BLOG_DESCRIPTION =
  'Operator-grade articles about AI search readiness, extractability, and site visibility.';

const PAGE_SIZE = 6;

function toAbsoluteUrl(appUrl: string, pathOrUrl: string): string {
  const base = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const env = await getPaymentApiEnv();
  return buildPublicPageMetadata({
    baseUrl: env.NEXT_PUBLIC_APP_URL,
    title: 'Blog | GEO-Pulse',
    description: BLOG_DESCRIPTION || SITE_DESCRIPTION,
    canonicalPath: '/blog',
    openGraphType: 'website',
  });
}

function formatDate(value: string | null): string {
  if (!value) return 'Unscheduled';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatLabel(value: string | null): string {
  if (!value) return '-';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getLatestTimestamp(values: ReadonlyArray<string | null | undefined>): string | null {
  const latest = values
    .map((value) => (value ? new Date(value).getTime() : null))
    .filter((value): value is number => value !== null)
    .reduce<number | null>((currentMax, value) => {
      if (currentMax === null) return value;
      return value > currentMax ? value : currentMax;
    }, null);

  return latest === null ? null : new Date(latest).toISOString();
}

function sortByPublishedDesc(articles: readonly PublicContentListRow[]): PublicContentListRow[] {
  return [...articles].sort((a, b) => {
    const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
    const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
    return tb - ta;
  });
}

function resolveAuthorHref(meta: ReturnType<typeof parseArticleMetadata>): string {
  const url = meta.authorUrl?.trim();
  if (url?.startsWith('http')) return url;
  if (url?.startsWith('/')) return url;
  return SITE_AUTHOR_URL_PATH;
}

type Props = {
  searchParams?: Promise<{ page?: string }>;
};

export default async function BlogIndexPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const pageRaw = sp.page;
  const pageParsed = pageRaw ? Number.parseInt(pageRaw, 10) : 1;
  const currentPage = Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : 1;

  const supabase = await createPublicContentClient();
  const [articles, env] = await Promise.all([
    createPublicContentData(supabase).getPublishedArticles(),
    getPaymentApiEnv(),
  ]);

  const sorted = sortByPublishedDesc(articles);
  const topicGroups = groupArticlesByTopic(articles);
  const topicLinks = topicGroups.map((g) => ({
    href: `/blog#${buildTopicAnchor(g.topicKey)}`,
    label: g.topicLabel,
  }));

  const editorsChoiceArticles =
    EDITORS_CHOICE_SLUGS.length > 0
      ? EDITORS_CHOICE_SLUGS.map((slug) => sorted.find((a) => a.slug === slug)).filter(
          (a): a is PublicContentListRow => a !== undefined
        )
      : [];

  const blogUrl = toAbsoluteUrl(env.NEXT_PUBLIC_APP_URL, '/blog');
  const topicUrls = topicGroups.map((group) =>
    toAbsoluteUrl(env.NEXT_PUBLIC_APP_URL, buildTopicHref(group.topicKey))
  );
  const blogStructuredData = buildBlogIndexStructuredData({
    blogUrl,
    description: BLOG_DESCRIPTION,
    topicUrls,
    dateModified: getLatestTimestamp(articles.map((article) => article.updated_at)) ?? undefined,
    authorName: SITE_EDITORIAL_NAME,
    authorUrl: blogUrl,
  });
  const breadcrumbStructuredData = buildBreadcrumbStructuredData([{ name: 'Blog', item: blogUrl }]);

  const totalFeed = Math.max(0, sorted.length - 1);
  const totalPages = totalFeed <= 0 ? 1 : Math.max(1, Math.ceil(totalFeed / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const feedOffset = (safePage - 1) * PAGE_SIZE;
  const hero = sorted.length > 0 ? sorted[0] : null;
  const feedRest = sorted.slice(1);
  const feedSlice = feedRest.slice(feedOffset, feedOffset + PAGE_SIZE);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData) }}
      />

      <BlogPromoStrip />

      <div className="mt-10">
        <BlogSubBar topicLinks={topicLinks} />
      </div>

      <section className="mt-10 max-w-3xl">
        <nav aria-label="Breadcrumb" className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
          <ol className="flex flex-wrap items-center gap-2">
            <li className="text-on-background">Blog</li>
          </ol>
        </nav>
        <p className="mt-4 font-label text-sm font-semibold uppercase tracking-widest text-gold">GEO-Pulse Blog</p>
        <h1 className="mt-3 font-sans text-4xl font-bold tracking-tight text-on-background md:text-5xl">
          Clear answers about AI search readiness
        </h1>
        <p className="mt-4 font-body text-lg leading-relaxed text-on-surface-variant">
          Site-first articles designed to be useful for operators and easy for language models to segment, summarize, and
          cite accurately.
        </p>
        <p className="mt-3 font-body text-sm text-on-surface-variant">
          Founder-led by{' '}
          <Link href="/about" className="font-semibold text-primary hover:underline">
            {SITE_AUTHOR_NAME}
          </Link>
          .
        </p>
        <p className="mt-2 font-body text-xs text-on-surface-variant/90">Editorially maintained by {SITE_EDITORIAL_NAME}.</p>
      </section>

      {articles.length === 0 ? (
        <section className="mt-12">
          <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-8 shadow-float">
            <h2 className="font-sans text-2xl font-semibold text-on-background">No published articles yet</h2>
            <p className="mt-3 max-w-2xl font-body text-on-surface-variant">
              The content machine is live in admin, but no article has been marked published yet. Once an item is published
              from the canonical content tables, it will appear here.
            </p>
          </div>
        </section>
      ) : (
        <>
          {hero ? (
            <div className="mt-12">
              {(() => {
                const meta = parseArticleMetadata(hero.metadata);
                const authorName = meta.authorName ?? SITE_AUTHOR_NAME;
                const authorHref = resolveAuthorHref(meta);
                return (
                  <BlogHeroCard
                    href={`/blog/${hero.slug}`}
                    title={hero.title}
                    excerpt={hero.excerpt}
                    categoryHref={buildTopicHref(hero.topic_cluster)}
                    categoryLabel={formatLabel(hero.topic_cluster)}
                    readMinutes={estimateReadMinutes(hero.excerpt)}
                    authorName={authorName}
                    authorHref={authorHref}
                    dateLabel={formatDate(hero.published_at)}
                    dateIso={hero.published_at}
                    heroImageUrl={meta.heroImageUrl}
                    heroImageAlt={meta.heroImageAlt ?? hero.title}
                  />
                );
              })()}
            </div>
          ) : null}

          {feedSlice.length > 0 ? (
            <div className="mt-12 space-y-8">
              {feedSlice.map((article, index) => {
                const meta = parseArticleMetadata(article.metadata);
                const authorName = meta.authorName ?? SITE_AUTHOR_NAME;
                const authorHref = resolveAuthorHref(meta);
                const globalIndex = feedOffset + index;
                return (
                  <BlogFeedCard
                    key={article.content_id}
                    href={`/blog/${article.slug}`}
                    title={article.title}
                    excerpt={article.excerpt}
                    categoryHref={buildTopicHref(article.topic_cluster)}
                    categoryLabel={formatLabel(article.topic_cluster)}
                    readMinutes={estimateReadMinutes(article.excerpt)}
                    authorName={authorName}
                    authorHref={authorHref}
                    dateLabel={formatDate(article.published_at)}
                    dateIso={article.published_at}
                    variantIndex={globalIndex}
                  />
                );
              })}
            </div>
          ) : null}

          <div className="mt-12">
            <BlogPagination currentPage={safePage} totalPages={totalPages} basePath="/blog" />
          </div>

          {editorsChoiceArticles.length > 0 ? (
            <div className="mt-16 lg:max-w-xl">
              <BlogEditorsChoice articles={editorsChoiceArticles} />
            </div>
          ) : null}

          <div className="mt-16">
            <BlogTopicColumns topicGroups={topicGroups} />
          </div>

          <section className="mt-16 rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-lowest/80 p-8">
            <h2 className="font-sans text-lg font-semibold text-on-background">References</h2>
            <ul className="mt-4 space-y-3 font-body text-sm text-on-surface-variant">
              <li>
                <a
                  href="https://developers.google.com/search/docs/crawling-indexing/robots/intro"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Google Search Central robots.txt guide
                </a>
              </li>
              <li>
                <a href="https://schema.org" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  Schema.org vocabulary
                </a>
              </li>
              <li>
                <a href="https://llmstxt.org" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  llms.txt specification
                </a>
              </li>
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
