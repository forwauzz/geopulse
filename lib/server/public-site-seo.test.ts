import { describe, expect, it } from 'vitest';
import { buildPublicPageMetadata, buildWebPageStructuredData } from './public-site-seo';

describe('public-site-seo', () => {
  it('builds canonical metadata and social previews from one helper', () => {
    const metadata = buildPublicPageMetadata({
      baseUrl: 'https://getgeopulse.com/',
      title: 'Pricing | GEO-Pulse',
      description: 'Pricing page',
      canonicalPath: '/pricing',
      openGraphType: 'website',
    });

    expect(metadata.alternates?.canonical).toBe('https://getgeopulse.com/pricing');
    expect(metadata.openGraph?.url).toBe('https://getgeopulse.com/pricing');
    expect((metadata.twitter as { card?: string } | undefined)?.card).toBe('summary');
  });

  it('builds a WebPage schema that points back to the site root', () => {
    const schema = buildWebPageStructuredData({
      url: 'https://getgeopulse.com/about',
      title: 'About | GEO-Pulse',
      description: 'About page',
      siteUrl: 'https://getgeopulse.com/',
    });

    expect(schema['@type']).toBe('WebPage');
    expect(schema.isPartOf.url).toBe('https://getgeopulse.com/');
  });
});
