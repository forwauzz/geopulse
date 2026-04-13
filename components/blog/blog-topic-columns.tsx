import Link from 'next/link';
import type { TopicGroup } from '@/lib/server/content-navigation';
import { buildTopicAnchor, buildTopicHref } from '@/lib/server/content-navigation';
import { parseArticleMetadata } from '@/lib/server/content-article-metadata';
import { SITE_AUTHOR_NAME } from '@/lib/server/public-site-seo';
import { estimateReadMinutes } from '@/lib/blog/read-time';

type BlogTopicColumnsProps = {
  readonly topicGroups: readonly TopicGroup[];
};

function formatDate(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function BlogTopicColumns({ topicGroups }: BlogTopicColumnsProps) {
  if (topicGroups.length === 0) return null;

  return (
    <section id="browse-topics" className="scroll-mt-28 space-y-16">
      <div className="border-b border-outline-variant/25 pb-6">
        <h2 className="font-sans text-2xl font-bold text-on-background md:text-3xl">Browse by topic</h2>
        <p className="mt-2 max-w-2xl font-body text-on-surface-variant">
          Explore clusters of related posts—structured for readers and for models that summarize and cite.
        </p>
      </div>
      {topicGroups.map((group) => (
        <div key={group.topicKey} id={buildTopicAnchor(group.topicKey)} className="scroll-mt-28">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
            <h3 className="font-sans text-xl font-bold text-on-background md:text-2xl">
              <Link href={buildTopicHref(group.topicKey)} className="hover:text-primary">
                {group.topicLabel}
              </Link>
            </h3>
            <Link
              href={buildTopicHref(group.topicKey)}
              className="font-sans text-sm font-semibold text-gold hover:text-primary hover:underline"
            >
              View all ({group.articles.length})
            </Link>
          </div>
          <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {group.articles.slice(0, 3).map((article) => {
              const meta = parseArticleMetadata(article.metadata);
              const author = meta.authorName ?? SITE_AUTHOR_NAME;
              const readM = estimateReadMinutes(article.excerpt);
              return (
                <li key={article.content_id}>
                  <article className="flex h-full flex-col rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-float">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gold">
                      {group.topicLabel}
                    </div>
                    <h4 className="mt-2 font-sans text-lg font-bold leading-snug text-on-background">
                      <Link href={`/blog/${article.slug}`} className="hover:text-primary">
                        {article.title}
                      </Link>
                    </h4>
                    {article.excerpt ? (
                      <p className="mt-2 line-clamp-3 flex-1 font-body text-sm text-on-surface-variant">{article.excerpt}</p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                      <span>{readM} min read</span>
                      <span aria-hidden>·</span>
                      <span>{author}</span>
                      {article.published_at ? (
                        <>
                          <span aria-hidden>·</span>
                          <time dateTime={article.published_at}>{formatDate(article.published_at)}</time>
                        </>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
