import type { Metadata } from 'next';

export const SITE_NAME = 'GEO-Pulse';
export const SITE_DESCRIPTION =
  'AI search readiness audits for public websites, with practical fixes for crawlability, structure, trust, and extractability.';
export const SITE_AUTHOR_NAME = 'Uzziel T.';
export const SITE_AUTHOR_ROLE = 'Founder, GEO-Pulse';
export const SITE_AUTHOR_URL_PATH = '/about';
export const SITE_EDITORIAL_NAME = 'GEO-Pulse Editorial';

export function normalizeBaseUrl(value: string | null | undefined): string {
  return (value || 'https://getgeopulse.com/').replace(/\/+$/, '');
}

export function toAbsoluteUrl(baseUrl: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = normalizeBaseUrl(baseUrl);
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

export function buildPublicPageMetadata(input: {
  readonly baseUrl: string;
  readonly title: string;
  readonly description: string;
  readonly canonicalPath: string;
  readonly openGraphType?: 'website' | 'article';
  readonly noIndex?: boolean;
  readonly image?: {
    readonly url: string;
    readonly alt: string;
  };
}): Metadata {
  const canonicalUrl = toAbsoluteUrl(input.baseUrl, input.canonicalPath);
  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: !input.noIndex,
      follow: !input.noIndex,
    },
    openGraph: {
      title: input.title,
      description: input.description,
      url: canonicalUrl,
      type: input.openGraphType ?? 'website',
      ...(input.image
        ? {
            images: [
              {
                url: input.image.url,
                alt: input.image.alt,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: input.image ? 'summary_large_image' : 'summary',
      title: input.title,
      description: input.description,
      ...(input.image ? { images: [input.image.url] } : {}),
    },
  };
}

export function buildOrganizationStructuredData(input: {
  readonly url: string;
  readonly description: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: input.url,
    description: input.description,
  };
}

export function buildWebSiteStructuredData(input: {
  readonly url: string;
  readonly description: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: input.url,
    description: input.description,
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: input.url,
    },
  };
}

export function buildWebPageStructuredData(input: {
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly siteUrl?: string;
  readonly dateModified?: string;
  readonly authorName?: string;
  readonly authorUrl?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: input.title,
    url: input.url,
    description: input.description,
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    ...(input.authorName
      ? {
          author: {
            '@type': 'Person',
            name: input.authorName,
            ...(input.authorUrl ? { url: input.authorUrl } : {}),
          },
        }
      : {}),
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: input.siteUrl ?? input.url,
    },
  };
}
