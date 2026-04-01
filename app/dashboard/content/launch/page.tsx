import Link from 'next/link';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createContentAdminData } from '@/lib/server/content-admin-data';
import { buildContentLaunchReadiness } from '@/lib/server/content-launch-readiness';

export const dynamic = 'force-dynamic';

function formatLabel(value: string | null): string {
  if (!value) return '-';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default async function ContentLaunchReadinessPage() {
  const adminContext = await loadAdminPageContext('/dashboard/content/launch');
  if (!adminContext.ok) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-error">{adminContext.message}</p>
      </main>
    );
  }

  const contentAdminData = createContentAdminData(adminContext.adminDb);
  const { summary, articles } = await buildContentLaunchReadiness(contentAdminData);

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">
            Admin
          </p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
            Blog launch readiness
          </h1>
          <p className="mt-1 max-w-2xl font-body text-on-surface-variant">
            One view for the first-launch threshold: enough connected published articles, topic hubs,
            and article-level readiness passes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/content"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
          >
            Back to content
          </Link>
        </div>
      </div>

      <section className="mt-10 grid gap-4 md:grid-cols-5">
        <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Published articles
          </p>
          <p className="mt-1 font-headline text-2xl font-bold text-on-background">
            {summary.publishedArticleCount}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Ready articles
          </p>
          <p className="mt-1 font-headline text-2xl font-bold text-on-background">
            {summary.readyArticleCount}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Topic pages
          </p>
          <p className="mt-1 font-headline text-2xl font-bold text-on-background">
            {summary.publishedTopicPageCount}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Connected topics
          </p>
          <p className="mt-1 font-headline text-2xl font-bold text-on-background">
            {summary.connectedPublishedTopicCount}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Launch threshold
          </p>
          <p className="mt-1 font-headline text-xl font-bold text-on-background">
            {summary.meetsLaunchThreshold ? 'Ready' : 'Not yet'}
          </p>
        </div>
      </section>

      <div className="mt-4 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 font-body text-sm text-on-surface-variant">
        First-launch threshold in this slice:
        <strong className="text-on-background"> 3 published article passes</strong>,
        <strong className="text-on-background"> 1 published topic page</strong>, and
        <strong className="text-on-background"> 1 topic cluster with at least 2 published articles</strong>.
      </div>

      <section className="mt-10">
        <div className="overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
          <table className="min-w-[980px] w-full border-collapse text-left font-body text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-on-surface-variant">
                <th className="px-4 py-3">Article</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Topic</th>
                <th className="px-4 py-3">Editorial readiness</th>
                <th className="px-4 py-3">Failed checks</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((article) => (
                <tr key={article.content_id} className="border-t border-outline-variant/10 align-top">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/content/${article.content_id}`}
                      className="font-medium text-on-background hover:text-primary"
                    >
                      {article.title}
                    </Link>
                    <div className="mt-1 text-xs text-on-surface-variant">
                      {article.content_id} / {article.slug}
                    </div>
                  </td>
                  <td className="px-4 py-3">{formatLabel(article.status)}</td>
                  <td className="px-4 py-3">{formatLabel(article.topic_cluster)}</td>
                  <td className="px-4 py-3">
                    {article.readinessPassed ? 'Pass' : 'Needs work'}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {article.failedChecks.length > 0 ? article.failedChecks.join('; ') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
