import type { Metadata } from 'next';
import Link from 'next/link';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import {
  buildOrganizationStructuredData,
  buildPublicPageMetadata,
  buildWebPageStructuredData,
  SITE_AUTHOR_NAME,
  SITE_AUTHOR_ROLE,
  SITE_DESCRIPTION,
  SITE_NAME,
  toAbsoluteUrl,
} from '@/lib/server/public-site-seo';

async function loadBaseUrl(): Promise<string> {
  const env = await getPaymentApiEnv();
  return env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/';
}

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await loadBaseUrl();
  return buildPublicPageMetadata({
    baseUrl,
    title: `About | ${SITE_NAME}`,
    description:
      'Who built GEO-Pulse, why it exists, and how the site keeps its public content machine-readable.',
    canonicalPath: '/about',
    openGraphType: 'website',
  });
}

export default async function AboutPage() {
  const baseUrl = await loadBaseUrl();
  const pageUrl = toAbsoluteUrl(baseUrl, '/about');
  const siteUrl = toAbsoluteUrl(baseUrl, '/');
  const pageModifiedAt = new Date().toISOString();
  const organizationSchema = buildOrganizationStructuredData({
    url: siteUrl,
    description: SITE_DESCRIPTION,
  });
  const webPageSchema = buildWebPageStructuredData({
    url: pageUrl,
    title: `About | ${SITE_NAME}`,
    description:
      'Who built GEO-Pulse, why it exists, and how the site keeps its public content machine-readable.',
    siteUrl: baseUrl,
    dateModified: pageModifiedAt,
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-16 md:px-10 md:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
      />

      <div className="max-w-3xl">
        <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">
          About
        </p>
        <h1 className="mt-4 font-headline text-4xl font-bold text-on-background md:text-5xl">
          GEO-Pulse is a founder-led product for AI search readiness
        </h1>
        <p className="mt-6 font-body text-lg leading-relaxed text-on-surface-variant">
          GEO-Pulse exists to make public pages easier for humans and language models to read,
          segment, and trust. The site combines audits, content operations, and a canonical blog so
          the same system used to create content can be evaluated against the same page-level
          standards.
        </p>
      </div>

      <section className="mt-12 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl bg-surface-container-low p-6 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-primary">Founder</p>
          <h2 className="mt-3 font-headline text-2xl font-bold text-on-background">
            {SITE_AUTHOR_NAME}
          </h2>
          <p className="mt-3 font-body leading-relaxed text-on-surface-variant">
            {SITE_AUTHOR_ROLE}. GEO-Pulse is built from a product-and-content workflow that keeps
            the public site aligned with the same editorial rules used to create and publish
            material.
          </p>
        </div>
        <div className="rounded-2xl bg-surface-container-low p-6 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-primary">What this page is for</p>
          <h2 className="mt-3 font-headline text-2xl font-bold text-on-background">
            A trust anchor for public pages
          </h2>
          <p className="mt-3 font-body leading-relaxed text-on-surface-variant">
            The public site links here so articles and product pages can point to a stable author and
            business identity page. That gives crawlers, buyers, and internal audits one place to
            verify who is behind the content.
          </p>
        </div>
      </section>

      <section className="mt-12 rounded-2xl bg-surface-container-lowest p-6 shadow-float">
        <p className="font-label text-xs uppercase tracking-widest text-primary">Operating rules</p>
        <ul className="mt-4 space-y-3 font-body text-on-surface-variant">
          <li>Public pages should be crawlable when they are meant to be discovered.</li>
          <li>Articles should carry explicit author, date, and source context when claims matter.</li>
          <li>LLM-facing pages should include clear structure, strong headings, and bounded claims.</li>
          <li>The canonical site should explain the product before it asks for sign-up or checkout.</li>
        </ul>
      </section>

      <section className="mt-12 rounded-2xl bg-surface-container-low p-6 shadow-float">
        <p className="font-label text-xs uppercase tracking-widest text-primary">References</p>
        <p className="mt-3 max-w-3xl font-body text-sm leading-relaxed text-on-surface-variant">
          GEO-Pulse uses the following public references as a baseline for crawlability, structured
          data, and machine-readable content:
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <a
            href="https://developers.google.com/search/docs/crawling-indexing/robots/intro"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm font-medium text-on-surface transition hover:bg-surface-container-high"
          >
            Google Search Central robots.txt guide
          </a>
          <a
            href="https://schema.org"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm font-medium text-on-surface transition hover:bg-surface-container-high"
          >
            Schema.org vocabulary
          </a>
          <a
            href="https://llmstxt.org"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm font-medium text-on-surface transition hover:bg-surface-container-high"
          >
            llms.txt specification
          </a>
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-4">
        <Link
          href="/blog"
          className="inline-flex rounded-xl bg-primary px-6 py-3 font-body text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
        >
          Read the blog
        </Link>
        <Link
          href="/"
          className="inline-flex rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-6 py-3 font-body text-sm font-semibold text-on-background transition hover:bg-surface-container-low"
        >
          Run a scan
        </Link>
      </div>
    </main>
  );
}
