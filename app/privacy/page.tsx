import type { Metadata } from 'next';
import Link from 'next/link';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import {
  buildOrganizationStructuredData,
  buildPublicPageMetadata,
  buildWebPageStructuredData,
  SITE_DESCRIPTION,
  SITE_EDITORIAL_NAME,
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
    title: `Privacy Policy | ${SITE_NAME}`,
    description: 'How GEO-Pulse collects, uses, stores, and protects data across scans, accounts, and billing.',
    canonicalPath: '/privacy',
    openGraphType: 'website',
  });
}

export default async function PrivacyPolicyPage() {
  const baseUrl = await loadBaseUrl();
  const pageUrl = toAbsoluteUrl(baseUrl, '/privacy');
  const siteUrl = toAbsoluteUrl(baseUrl, '/');
  const pageModifiedAt = new Date().toISOString();
  const organizationSchema = buildOrganizationStructuredData({
    url: siteUrl,
    description: SITE_DESCRIPTION,
  });
  const webPageSchema = buildWebPageStructuredData({
    url: pageUrl,
    title: `Privacy Policy | ${SITE_NAME}`,
    description: 'How GEO-Pulse collects, uses, stores, and protects data across scans, accounts, and billing.',
    siteUrl,
    dateModified: pageModifiedAt,
    authorName: SITE_EDITORIAL_NAME,
    authorUrl: pageUrl,
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
          Privacy Policy
        </p>
        <p className="mt-3 font-body text-sm text-on-surface-variant">
          Editorially maintained by {SITE_EDITORIAL_NAME}.
        </p>
        <h1 className="mt-4 font-headline text-4xl font-bold text-on-background md:text-5xl">
          Privacy and data handling at GEO-Pulse
        </h1>
        <p className="mt-6 font-body text-lg leading-relaxed text-on-surface-variant">
          This page explains what data GEO-Pulse collects, why we use it, how we store it, and
          what controls you have over your information.
        </p>
        <p className="mt-4 font-body text-sm text-on-surface-variant">
          For identity and company context, see the{' '}
          <Link href="/about" className="font-semibold text-primary hover:underline">
            About page
          </Link>
          .
        </p>
      </div>

      <section className="mt-12 rounded-2xl bg-surface-container-low p-6 shadow-float">
        <h2 className="font-headline text-2xl font-bold text-on-background">Information we collect</h2>
        <ul className="mt-4 space-y-3 font-body text-on-surface-variant">
          <li>Scan inputs, including the URL you submit and the results returned by the audit.</li>
          <li>Account data, such as your email, workspace membership, and sign-in activity.</li>
          <li>Billing data, such as subscription status and payment-provider metadata needed to manage access.</li>
          <li>Operational data, such as request logs, delivery events, and support-related status messages.</li>
        </ul>
      </section>

      <section className="mt-12 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl bg-surface-container-low p-6 shadow-float">
          <h2 className="font-headline text-2xl font-bold text-on-background">How we use it</h2>
          <ul className="mt-4 space-y-3 font-body text-on-surface-variant">
            <li>Run audits and generate reports.</li>
            <li>Deliver scan results, reports, and account notifications.</li>
            <li>Operate the product, prevent abuse, and improve reliability.</li>
            <li>Support billing, account access, and workspace management.</li>
          </ul>
        </div>
        <div className="rounded-2xl bg-surface-container-low p-6 shadow-float">
          <h2 className="font-headline text-2xl font-bold text-on-background">Cookies and analytics</h2>
          <ul className="mt-4 space-y-3 font-body text-on-surface-variant">
            <li>We use cookies and similar technologies where needed for authentication and product operation.</li>
            <li>We may use analytics or logging to understand reliability, performance, and abuse signals.</li>
            <li>You can control browser cookie settings, but some features may stop working if required cookies are blocked.</li>
          </ul>
        </div>
      </section>

      <section className="mt-12 rounded-2xl bg-surface-container-lowest p-6 shadow-float">
        <h2 className="font-headline text-2xl font-bold text-on-background">Sharing and retention</h2>
        <div className="mt-4 space-y-4 font-body text-on-surface-variant">
          <p>
            We share data with service providers only when needed to run the product, deliver
            reports, process payments, or keep the service secure.
          </p>
          <p>
            We retain information for as long as needed to provide the service, support account
            history, comply with obligations, and resolve disputes.
          </p>
          <p>
            If we change how we process data, this page should be updated before the change is
            considered live.
          </p>
        </div>
      </section>

      <section className="mt-12 rounded-2xl bg-surface-container-low p-6 shadow-float">
        <h2 className="font-headline text-2xl font-bold text-on-background">Your choices</h2>
        <ul className="mt-4 space-y-3 font-body text-on-surface-variant">
          <li>Review or update your account details through the app when available.</li>
          <li>Request removal or export of account data through the site support path.</li>
          <li>Contact the team through the <Link href="/about" className="font-semibold text-primary hover:underline">About page</Link> if you need a privacy or data question handled.</li>
        </ul>
      </section>

      <div className="mt-10 flex flex-wrap gap-4">
        <Link
          href="/"
          className="inline-flex rounded-xl bg-primary px-6 py-3 font-body text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
        >
          Run a scan
        </Link>
        <Link
          href="/login"
          className="inline-flex rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-6 py-3 font-body text-sm font-semibold text-on-background transition hover:bg-surface-container-low"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
