import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BlogArticleBody } from '@/components/blog-article-body';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import {
  buildArticleStructuredData,
  parseArticleMetadata,
} from '@/lib/server/content-article-metadata';
import {
  buildTopicHref,
  getArticlesForTopic,
  getRelatedArticles,
  formatTopicLabel,
  groupArticlesByTopic,
} from '@/lib/server/content-navigation';
import { buildBreadcrumbStructuredData } from '@/lib/server/content-structured-data';
import { createPublicContentClient } from '@/lib/server/public-content-client';
import { createPublicContentData } from '@/lib/server/public-content-data';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
};

function formatDate(value: string | null): string {
  if (!value) return 'Unscheduled';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatLabel(value: string | null): string {
  return value ? formatTopicLabel(value) : '-';
}

function extractLeadParagraph(markdown: string): string | null {
  const paragraphs = markdown
    .split(/\r?\n\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith('#') && !part.startsWith('- ') && !part.startsWith('* '));

  return paragraphs[0] ?? null;
}

function clampDescription(value: string, maxLength = 155): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

type TocItem = {
  readonly id: string;
  readonly title: string;
  readonly level: 2 | 3;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function extractToc(markdown: string): TocItem[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .reduce<TocItem[]>((items, line) => {
      const match = /^(#{1,2})\s+(.+?)\s*$/.exec(line);
      if (!match) return items;
      const marker = match[1] ?? '';
      const rawTitle = match[2] ?? '';
      const level = marker.length === 1 ? 2 : 3;
      const title = rawTitle.replace(/\s+#+$/, '').trim();
      if (!title) return items;
      items.push({ id: slugify(title), title, level });
      return items;
    }, [])
    .slice(0, 8);
}

function toAbsoluteUrl(appUrl: string, pathOrUrl: string | null, slug?: string): string {
  const fallback = slug ? `/blog/${slug}` : '/';
  const value = pathOrUrl?.trim() || fallback;
  if (/^https?:\/\//i.test(value)) return value;
  const base = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
  const path = value.startsWith('/') ? value : `/${value}`;
  return `${base}${path}`;
}

function getPublicSourceLinks(sourceLinks: readonly string[]): string[] {
  return sourceLinks.filter((sourceLink) => /^https?:\/\//i.test(sourceLink));
}

async function loadPublicContentData() {
  const supabase = await createPublicContentClient();
  return createPublicContentData(supabase);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const publicContent = await loadPublicContentData();
  const article = await publicContent.getPublishedArticleBySlug(slug);
  const env = await getPaymentApiEnv();
  if (!article) {
    return {
      title: 'Article not found | GEO-Pulse',
    };
  }

  const description =
    clampDescription(
      extractLeadParagraph(article.draft_markdown) ??
        article.primary_problem ??
        'Operator-grade guidance about AI search readiness.'
    );
  const articleMetadata = parseArticleMetadata(article.metadata);
  const canonicalUrl = toAbsoluteUrl(env.NEXT_PUBLIC_APP_URL, article.canonical_url, article.slug);

  return {
    title: `${article.title} | GEO-Pulse`,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: !articleMetadata.noIndex,
      follow: !articleMetadata.noIndex,
    },
    openGraph: {
      title: `${article.title} | GEO-Pulse`,
      description,
      url: canonicalUrl,
      type: 'article',
      images: articleMetadata.heroImageUrl
        ? [
            {
              url: articleMetadata.heroImageUrl,
              alt: articleMetadata.heroImageAlt ?? article.title,
            },
          ]
        : [],
    },
  };
}

export default async function BlogArticlePage({ params }: Props) {
  const { slug } = await params;
  const publicContent = await loadPublicContentData();
  const [article, articles, env] = await Promise.all([
    publicContent.getPublishedArticleBySlug(slug),
    publicContent.getPublishedArticles(),
    getPaymentApiEnv(),
  ]);
  if (!article) notFound();

  const articleMetadata = parseArticleMetadata(article.metadata);
  const leadParagraph = extractLeadParagraph(article.draft_markdown);
  const canonicalUrl = toAbsoluteUrl(env.NEXT_PUBLIC_APP_URL, article.canonical_url, article.slug);
  const authorUrl = articleMetadata.authorUrl ?? toAbsoluteUrl(env.NEXT_PUBLIC_APP_URL, '/about');
  const description =
    leadParagraph ?? article.primary_problem ?? 'Operator-grade guidance about AI search readiness.';
  const structuredData = buildArticleStructuredData({
    title: article.title,
    description,
    canonicalUrl,
    publishedAt: article.published_at,
    updatedAt: article.updated_at,
    authorName: articleMetadata.authorName,
    authorRole: articleMetadata.authorRole,
    authorUrl,
    heroImageUrl: articleMetadata.heroImageUrl,
  });
  const breadcrumbStructuredData = buildBreadcrumbStructuredData([
    { name: 'Blog', item: toAbsoluteUrl(env.NEXT_PUBLIC_APP_URL, '/blog', article.slug) },
    {
      name: formatLabel(article.topic_cluster),
      item: toAbsoluteUrl(
        env.NEXT_PUBLIC_APP_URL,
        buildTopicHref(article.topic_cluster),
        article.slug
      ),
    },
    { name: article.title, item: canonicalUrl },
  ]);
  const relatedArticles = getRelatedArticles(articles, article.slug, article.topic_cluster, 3);
  const bodyRelatedArticles = relatedArticles.slice(0, 2);
  const browseArticles = articles.filter((item) => item.slug !== article.slug).slice(0, 8);
  const topicGroups = groupArticlesByTopic(articles);
  const inTopicArticles = getArticlesForTopic(articles, article.topic_cluster)
    .filter((item) => item.slug !== article.slug)
    .slice(0, 8);
  const publicSourceLinks = getPublicSourceLinks(article.source_links);
  const tocItems = extractToc(article.draft_markdown);

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 md:px-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData) }}
      />
      <div className="mb-10">
        <nav aria-label="Breadcrumb" className="font-label text-xs uppercase tracking-widest">
          <ol className="flex flex-wrap items-center gap-2 text-on-surface-variant">
            <li>
              <Link href="/blog" className="text-primary hover:text-primary-dim hover:underline">
                Blog
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href={buildTopicHref(article.topic_cluster)} className="text-primary hover:text-primary-dim hover:underline">
                {formatLabel(article.topic_cluster)}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-on-background">{article.title}</li>
          </ol>
        </nav>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs uppercase tracking-widest text-on-surface-variant">
          <span>{formatDate(article.published_at)}</span>
          <span>&bull;</span>
          <Link href={authorUrl} className="hover:text-primary">
            {articleMetadata.authorName ?? 'GEO-Pulse'}
          </Link>
          <span>&bull;</span>
          <span>{formatLabel(article.target_persona)}</span>
          <span>&bull;</span>
          <Link href={buildTopicHref(article.topic_cluster)} className="hover:text-primary">
            {formatLabel(article.topic_cluster)}
          </Link>
        </div>
        <h1 className="mt-4 max-w-4xl font-headline text-4xl font-bold leading-tight text-on-background md:text-5xl">
          {article.title}
        </h1>
        {articleMetadata.heroImageUrl ? (
          <div className="mt-6 overflow-hidden rounded-2xl bg-surface-container-low shadow-float">
            <img
              src={articleMetadata.heroImageUrl}
              alt={articleMetadata.heroImageAlt ?? article.title}
              className="aspect-[16/8] w-full object-cover"
            />
          </div>
        ) : null}
        {article.primary_problem ? (
          <p className="mt-4 max-w-3xl font-body text-lg font-medium leading-relaxed text-on-background">
            {article.primary_problem}
          </p>
        ) : null}
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="rounded-2xl bg-surface-container-lowest p-8 shadow-float">
          <section className="mb-8 grid gap-4 md:grid-cols-2">
            {leadParagraph ? (
              <div className="rounded-2xl bg-surface-container-low p-6">
                <p className="font-label text-xs uppercase tracking-widest text-gold">BLUF</p>
                <p className="mt-3 max-w-3xl font-body leading-relaxed text-on-surface-variant">{leadParagraph}</p>
              </div>
            ) : null}
            <div className="rounded-2xl bg-surface-container-low p-6">
              <p className="font-label text-xs uppercase tracking-widest text-gold">Editorial context</p>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-on-surface-variant">
                Authored by{' '}
                <Link href={authorUrl} className="font-semibold text-primary hover:text-primary-dim hover:underline">
                  {articleMetadata.authorName ?? 'GEO-Pulse'}
                </Link>
                {articleMetadata.authorRole ? `, ${articleMetadata.authorRole}` : ''}. See the{' '}
                <Link href="/about" className="font-semibold text-primary hover:underline">
                  About page
                </Link>
                {' '}for site identity and editorial context.
              </p>
            </div>
          </section>

          <section className="mb-8 rounded-2xl bg-surface-container-low p-6">
            <p className="font-label text-xs uppercase tracking-widest text-gold">
              On this topic
            </p>
            <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
              This article is part of the{' '}
              <Link
                href={buildTopicHref(article.topic_cluster)}
                className="font-medium text-primary hover:text-primary-dim hover:underline"
              >
                {formatLabel(article.topic_cluster)}
              </Link>{' '}
              cluster. Use the topic page and related articles below to move through the same subject
              without losing context.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={buildTopicHref(article.topic_cluster)}
                className="rounded-xl border border-outline-variant/35 bg-surface-container px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface-container-high"
              >
                Open topic page
              </Link>
              {bodyRelatedArticles.map((related) => (
                <Link
                  key={related.content_id}
                  href={`/blog/${related.slug}`}
                  className="rounded-xl border border-outline-variant/35 bg-surface-container px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface-container-high"
                >
                  {related.title}
                </Link>
              ))}
            </div>
          </section>

          {tocItems.length > 0 ? (
            <section className="mb-8 rounded-2xl bg-surface-container-low p-6">
              <p className="font-label text-xs uppercase tracking-widest text-gold">
                Contents
              </p>
              <ol className="mt-4 space-y-2 text-sm">
                {tocItems.map((item) => (
                  <li key={item.id} className={item.level === 3 ? 'pl-4' : ''}>
                    <a href={`#${item.id}`} className="text-on-background hover:text-primary">
                      {item.title}
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <BlogArticleBody markdown={article.draft_markdown} />

          {relatedArticles.length > 0 ? (
            <section className="mt-10 border-t border-outline-variant/35 pt-8">
              <p className="font-label text-xs uppercase tracking-widest text-gold">
                Continue the topic
              </p>
              <h2 className="mt-3 font-headline text-2xl font-semibold text-on-background">
                Related articles
              </h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {relatedArticles.map((related) => (
                  <Link
                    key={related.content_id}
                    href={`/blog/${related.slug}`}
                    className="rounded-2xl bg-surface-container-low p-5 transition hover:bg-surface-container"
                  >
                    <p className="text-xs uppercase tracking-widest text-on-surface-variant">
                      {formatLabel(related.topic_cluster)}
                    </p>
                    <h3 className="mt-2 font-headline text-xl font-semibold text-on-background">
                      {related.title}
                    </h3>
                    {related.excerpt ? (
                      <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                        {related.excerpt}
                      </p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </article>

        <aside className="space-y-6">
          <section className="rounded-2xl bg-surface-container-low p-6 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-gold">Browse topics</p>
            <ul className="mt-4 space-y-3 text-sm">
              {topicGroups.map((topicGroup) => (
                <li key={topicGroup.topicKey}>
                  <Link
                    href={buildTopicHref(topicGroup.topicKey)}
                    className={
                      topicGroup.topicKey === (article.topic_cluster?.trim() || 'general')
                        ? 'text-gold'
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

          {inTopicArticles.length > 0 ? (
            <section className="rounded-2xl bg-surface-container-low p-6 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                In this topic
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                {inTopicArticles.map((topicArticle) => (
                  <li key={topicArticle.content_id}>
                    <Link
                      href={`/blog/${topicArticle.slug}`}
                      className="text-on-background hover:text-primary"
                    >
                      {topicArticle.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-2xl bg-surface-container-low p-6 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-gold">
              Practical next step
            </p>
            <h2 className="mt-3 font-headline text-2xl font-semibold text-on-background">
              Run the free scan
            </h2>
            <p className="mt-3 font-body leading-relaxed text-on-surface-variant">
              Use GEO-Pulse to check crawlability, structure, extractability, and trust signals on
              your own site before you decide what to fix first.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 font-body text-sm font-semibold text-on-primary transition hover:opacity-90"
            >
              Start free scan
            </Link>
          </section>

          <section className="rounded-2xl bg-surface-container-low p-6 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
              Article metadata
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Content ID</p>
                <p className="mt-1 text-on-background">{article.content_id}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Keyword cluster</p>
                <p className="mt-1 text-on-background">{formatLabel(article.keyword_cluster)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Topic page</p>
                <p className="mt-1">
                  <Link
                    href={buildTopicHref(article.topic_cluster)}
                    className="text-primary hover:text-primary-dim hover:underline"
                  >
                    {formatLabel(article.topic_cluster)}
                  </Link>
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Updated</p>
                <p className="mt-1 text-on-background">{formatDate(article.updated_at)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Author</p>
                <p className="mt-1 text-on-background">
                  <Link href={authorUrl} className="hover:text-primary">
                    {articleMetadata.authorName ?? 'GEO-Pulse'}
                  </Link>
                  {articleMetadata.authorRole ? ` / ${articleMetadata.authorRole}` : ''}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">
                  Public sources
                </p>
                <ul className="mt-2 space-y-2 text-on-surface-variant">
                  {publicSourceLinks.length === 0 ? (
                    <li>
                      This article is currently based on GEO-Pulse editorial and product-context
                      inputs. Add public citations when the draft makes external factual claims.
                    </li>
                  ) : (
                    publicSourceLinks.map((sourceLink) => (
                      <li key={sourceLink} className="break-all">
                        <a
                          href={sourceLink}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-primary"
                        >
                          {sourceLink}
                        </a>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-surface-container-low p-6 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
              Browse articles
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              {browseArticles.map((browseArticle) => (
                <li key={browseArticle.content_id}>
                  <Link
                    href={`/blog/${browseArticle.slug}`}
                    className="text-on-background hover:text-primary"
                  >
                    {browseArticle.title}
                  </Link>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    <Link href={buildTopicHref(browseArticle.topic_cluster)} className="hover:text-primary">
                      {formatLabel(browseArticle.topic_cluster)}
                    </Link>
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <Link href="/blog" className="text-sm font-medium text-primary hover:text-primary-dim hover:underline">
                View all topics and articles
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}



