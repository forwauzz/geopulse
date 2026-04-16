import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './login-form';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import {
  buildPublicPageMetadata,
  buildWebPageStructuredData,
  toAbsoluteUrl,
} from '@/lib/server/public-site-seo';

type Props = {
  searchParams: Promise<{
    next?: string;
    error?: string;
    mode?: string;
    bundle?: string;
    organization_name?: string;
    website_url?: string;
  }>;
};

function safeNextPath(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/dashboard';
  }
  return raw;
}

async function loadBaseUrl(): Promise<string> {
  const env = await getPaymentApiEnv();
  return env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/';
}

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await loadBaseUrl();
  return buildPublicPageMetadata({
    baseUrl,
    title: 'Sign in | GEO-Pulse',
    description: 'Sign in to GEO-Pulse to access dashboards, saved audits, and paid reports.',
    canonicalPath: '/login',
    openGraphType: 'website',
  });
}

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const baseUrl = await loadBaseUrl();
  const pageModifiedAt = new Date().toISOString();
  const pageSchema = buildWebPageStructuredData({
    url: toAbsoluteUrl(baseUrl, '/login'),
    title: 'Sign in | GEO-Pulse',
    description: 'Sign in to GEO-Pulse to access dashboards, saved audits, and paid reports.',
    siteUrl: toAbsoluteUrl(baseUrl, '/'),
    dateModified: pageModifiedAt,
  });
  const nextPath = safeNextPath(sp.next);
  const err = sp.error;
  const isSignUp = sp.mode === 'signup';
  const bundleKey = sp.bundle?.trim() || undefined;
  const organizationName = sp.organization_name?.trim() || undefined;
  const websiteUrl = sp.website_url?.trim() || undefined;

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }}
      />
      <Link href="/" className="font-body text-sm font-semibold text-tertiary hover:underline">
        {'<-'} Back to GEO-Pulse
      </Link>
      <h1 className="mt-8 font-headline text-3xl font-bold tracking-tight text-on-background md:text-4xl">
        {isSignUp ? 'Create your account' : 'Sign in'}
      </h1>
      <p className="mt-2 max-w-2xl font-body text-on-surface-variant">
        {isSignUp
          ? 'Create your account for the plan you selected, then continue to checkout.'
          : 'Customer accounts can still use a magic link. Agency and pilot accounts can also sign in with an email and password.'}
      </p>
      <p className="mt-3 max-w-2xl font-body text-sm text-on-surface-variant">
        Public context lives on the{' '}
        <Link href="/about" className="font-semibold text-primary hover:underline">
          About page
        </Link>
        , while private account access stays here. See the{' '}
        <Link href="/privacy" className="font-semibold text-primary hover:underline">
          Privacy Policy
        </Link>{' '}
        for data handling details.
      </p>
      {!isSignUp && (
        <div className="mt-4 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3">
          <p className="font-body text-sm font-semibold text-on-background">Report recovery tip</p>
          <p className="mt-1 font-body text-sm leading-6 text-on-surface-variant">
            If you already paid for a deep audit, sign in with the Stripe checkout email first.
            That is how past paid reports are linked into your dashboard.
          </p>
        </div>
      )}
      {err ? (
        <p className="mt-4 rounded-xl border border-error/30 bg-surface-container-low px-4 py-3 font-body text-sm text-error">
          {decodeURIComponent(err)}
        </p>
      ) : null}
      <LoginForm
        nextPath={nextPath}
        isSignUp={isSignUp}
        bundleKey={bundleKey}
        organizationName={organizationName}
        websiteUrl={websiteUrl}
      />
    </main>
  );
}
