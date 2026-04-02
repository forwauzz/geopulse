import type { Metadata } from 'next';
import Link from 'next/link';
import {
  buildTopicAnchor,
  buildTopicHref,
  groupArticlesByTopic,
} from '@/lib/server/content-navigation';
import { parseArticleMetadata } from '@/lib/server/content-article-metadata';
import { createPublicContentClient } from '@/lib/server/public-content-client';
import { createPublicContentData } from '@/lib/server/public-content-data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Blog | GEO-Pulse',
  description:
    'Operator-grade articles about AI search readiness, extractability, and site visibility.',
};

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

export default async function BlogIndexPage() {
  const supabase = await createPublicContentClient();
  const articles = await createPublicContentData(supabase).getPublishedArticles();
  const topicGroups = groupArticlesByTopic(articles);

  return (
    <main className="mx-auto max-w-7xl px-6 py-16 md:px-10">
      <section className="max-w-3xl">
        <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">
          GEO-Pulse Blog
        </p>
        <h1 className="mt-3 font-headline text-4xl font-bold text-on-background md:text-5xl">
          Clear answers about AI search readiness
        </h1>
        <p className="mt-4 font-body text-lg leading-relaxed text-on-surface-variant">
          Site-first articles designed to be useful for operators and easy for language models to
          segment, summarize, and cite accurately.
        </p>
      </section>

      {articles.length === 0 ? (
        <section className="mt-12">
          <div className="rounded-2xl bg-surface-container-low p-8 shadow-float">
            <h2 className="font-headline text-2xl font-semibold text-on-background">
              No published articles yet
            </h2>
            <p className="mt-3 max-w-2xl font-body text-on-surface-variant">
              The content machine is live in admin, but no article has been marked published yet.
              Once an item is published from the canonical content tables, it will appear here.
            </p>
          </div>
        </section>
      ) : (
        <div className="mt-12 grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <section className="rounded-2xl bg-surface-container-low p-6 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-primary">
                Browse topics
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                {topicGroups.map((group) => (
                  <li key={group.topicKey}>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`#${buildTopicAnchor(group.topicKey)}`}
                        className="text-on-background hover:text-primary"
                      >
                        {group.topicLabel}
                      </a>
                      <span className="text-on-surface-variant">/</span>
                      <Link href={buildTopicHref(group.topicKey)} className="text-primary hover:underline">
                        Open topic page
                      </Link>
                    </div>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {group.articles.length} article{group.articles.length === 1 ? '' : 's'}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl bg-surface-container-low p-6 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                Article menu
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                {articles.map((article) => (
                  <li key={article.content_id}>
                    <Link href={`/blog/${article.slug}`} className="text-on-background hover:text-primary">
                      {article.title}
                    </Link>
                    <p className="mt-1 text-xs text-on-surface-variant">
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
                  <p className="font-label text-xs uppercase tracking-widest text-primary">
                    Topic cluster
                  </p>
                  <h2 className="mt-2 font-headline text-2xl font-bold text-on-background">
                    <Link href={buildTopicHref(group.topicKey)} className="hover:text-primary">
                      {group.topicLabel}
                    </Link>
                  </h2>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Keep related articles linked and clustered so readers and language models can move
                    through the topic without dead ends.
                  </p>
                </div>

                <div className="grid gap-6">
                  {group.articles.map((article) => (
                    <article
                      key={article.content_id}
                      className="overflow-hidden rounded-2xl bg-surface-container-lowest shadow-float"
                    >
                      {(() => {
                        const articleMetadata = parseArticleMetadata((article as { metadata?: Record<string, unknown> }).metadata);
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
                        <span>{formatLabel(article.target_persona)}</span>
                        <span>&bull;</span>
                        <Link href={buildTopicHref(article.topic_cluster)} className="hover:text-primary">
                          {formatLabel(article.topic_cluster)}
                        </Link>
                      </div>
                      <h3 className="mt-4 font-headline text-3xl font-bold text-on-background">
                        <Link href={`/blog/${article.slug}`} className="hover:text-primary">
                          {article.title}
                        </Link>
                      </h3>
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
                </div>
              </section>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}
