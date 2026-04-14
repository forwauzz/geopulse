import Link from 'next/link';
import type { PublicContentListRow } from '@/lib/server/public-content-data';

type BlogEditorsChoiceProps = {
  readonly articles: readonly PublicContentListRow[];
};

export function BlogEditorsChoice({ articles }: BlogEditorsChoiceProps) {
  if (articles.length === 0) return null;

  return (
    <section aria-labelledby="editors-choice-heading" className="rounded-2xl border border-gold/20 bg-surface-container-lowest p-8 shadow-float">
      <h2 id="editors-choice-heading" className="font-sans text-lg font-bold text-on-background">
        Editor&apos;s choice
      </h2>
      <ul className="mt-6 space-y-5">
        {articles.map((article) => (
          <li key={article.content_id}>
            <Link
              href={`/blog/${article.slug}`}
              className="font-sans text-base font-semibold text-on-background hover:text-primary hover:underline"
            >
              {article.title}
            </Link>
            {article.excerpt ? (
              <p className="mt-1 line-clamp-2 font-body text-sm text-on-surface-variant">{article.excerpt}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
