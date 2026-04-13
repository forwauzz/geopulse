import type { Metadata } from 'next';
import Link from 'next/link';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import {
  buildTopicAnchor,
  buildTopicHref,
  groupArticlesByTopic,
} from '@/lib/server/content-navigation';
import { parseArticleMetadata } from '@/lib/server/content-article-metadata';
import {
  buildBlogIndexStructuredData,
  buildBreadcrumbStructuredData,
} from '@/lib/server/content-structured-data';
import { createPublicContentClient } from '@/lib/server/public-content-client';
import { createPublicContentData } from '@/lib/server/public-content-data';
import {
  buildPublicPageMetadata,
  SITE_AUTHOR_NAME,
  SITE_DESCRIPTION,
  SITE_EDITORIAL_NAME,
} from '@/lib/server/public-site-seo';

export const dynamic = 'force-dynamic';

const BLOG_DESCRIPTION =
  'Operator-grade articles about AI search readiness, extractability, and site visibility.';

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

export default async function BlogIndexPage() {
  const supabase = await createPublicContentClient();
  const [articles, env] = await Promise.all([
    createPublicContentData(supabase).getPublishedArticles(),
    getPaymentApiEnv(),
  ]);
  const topicGroups = groupArticlesByTopic(articles);
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

  return (
    <main className="mx-auto max-w-7xl px-6 py-16 md:px-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData) }}
      />
      <section className="max-w-3xl">
        <nav aria-label="Breadcrumb" className="font-label text-xs uppercase tracking-widest">
          <ol className="flex flex-wrap items-center gap-2 text-zinc-300">
            <li className="text-white">Blog</li>
          </ol>
        </nav>
        <p className="font-label text-sm font-semibold uppercase tracking-widest text-sky-300">
          GEO-Pulse Blog
        </p>
        <h1 className="mt-3 font-headline text-4xl font-bold text-white md:text-5xl">
          Clear answers about AI search readiness
        </h1>
        <p className="mt-4 font-body text-lg leading-relaxed text-zinc-300">
          Site-first articles designed to be useful for operators and easy for language models to
          segment, summarize, and cite accurately.
        </p>
        <p className="mt-3 font-body text-sm text-zinc-300">
          Founder-led by{' '}
          <Link href="/about" className="font-semibold text-sky-300 hover:underline">
            {SITE_AUTHOR_NAME}
          </Link>
          .
        </p>
        <p className="mt-2 font-body text-xs text-zinc-400">
          Editorially maintained by {SITE_EDITORIAL_NAME}.
        </p>
      </section>

      {articles.length === 0 ? (
        <section className="mt-12">
          <div className="rounded-2xl bg-zinc-900 p-8 shadow-float">
            <h2 className="font-headline text-2xl font-semibold text-white">
              No published articles yet
            </h2>
            <p className="mt-3 max-w-2xl font-body text-zinc-300">
              The content machine is live in admin, but no article has been marked published yet.
              Once an item is published from the canonical content tables, it will appear here.
            </p>
          </div>
        </section>
      ) : (
        <div className="mt-12 grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <section className="rounded-2xl bg-zinc-900 p-6 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-sky-300">
                Browse topics
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                {topicGroups.map((group) => (
                  <li key={group.topicKey}>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`#${buildTopicAnchor(group.topicKey)}`}
                        className="text-white hover:text-sky-300"
                      >
                        {group.topicLabel}
                      </a>
                      <span className="text-zinc-300">/</span>
                      <Link href={buildTopicHref(group.topicKey)} className="text-sky-300 hover:text-sky-200 hover:underline">
                        Open topic page
                      </Link>
                    </div>
                    <p className="mt-1 text-xs text-zinc-300">
                      {group.articles.length} article{group.articles.length === 1 ? '' : 's'}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl bg-zinc-900 p-6 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-zinc-300">
                Article menu
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                {articles.map((article) => (
                  <li key={article.content_id}>
                    <Link href={`/blog/${article.slug}`} className="text-white hover:text-sky-300">
                      {article.title}
                    </Link>
                    <p className="mt-1 text-xs text-zinc-300">
                      {formatLabel(article.topic_cluster)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </aside>

          <section className="space-y-10">
            {topicGroups.map((group) => (
              <section key={group.topicKey} id={buildTopicAnchor(group.topicKey)} className="scroll-mt-28">
                <div className="mb-5">
                  <p className="font-label text-xs uppercase tracking-widest text-sky-300">
                    Topic cluster
                  </p>
                  <h2 className="mt-2 font-headline text-2xl font-bold text-white">
                    <Link href={buildTopicHref(group.topicKey)} className="hover:text-sky-300">
                      {group.topicLabel}
                    </Link>
                  </h2>
                  <p className="mt-2 text-sm text-zinc-300">
                    Keep related articles linked and clustered so readers and language models can move
                    through the topic without dead ends.
                  </p>
                </div>

                <div className="grid gap-6">
                  {group.articles.map((article) => (
                    <article
                      key={article.content_id}
                      className="overflow-hidden rounded-2xl bg-zinc-950 shadow-float"
                    >
                      {(() => {
                        const articleMetadata = parseArticleMetadata((article as { metadata?: Record<string, unknown> }).metadata);
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
                        <span>{formatLabel(article.target_persona)}</span>
                        <span>&bull;</span>
                        <Link href={buildTopicHref(article.topic_cluster)} className="hover:text-sky-300">
                          {formatLabel(article.topic_cluster)}
                        </Link>
                      </div>
                      <h3 className="mt-4 font-headline text-3xl font-bold text-white">
                        <Link href={`/blog/${article.slug}`} className="hover:text-sky-300">
                          {article.title}
                        </Link>
                      </h3>
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
                </div>
              </section>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}


