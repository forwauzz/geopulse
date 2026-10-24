export type PublicSitemapEntry = {
  readonly url: string;
  readonly lastModified?: string | Date | null;
  readonly changeFrequency?: string;
  readonly priority?: number;
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function renderLastModified(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function renderPublicSitemapXml(entries: readonly PublicSitemapEntry[]): string {
  const urls = entries.map((entry) => {
    const lastModified = renderLastModified(entry.lastModified);
    const fields = [
      `<loc>${escapeXml(entry.url)}</loc>`,
      lastModified ? `<lastmod>${lastModified}</lastmod>` : null,
      entry.changeFrequency ? `<changefreq>${escapeXml(entry.changeFrequency)}</changefreq>` : null,
      entry.priority === undefined ? null : `<priority>${entry.priority}</priority>`,
    ].filter((value): value is string => value !== null);
    return `<url>${fields.join('')}</url>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
  ].join('');
}

export function publicSitemapResponse(entries: readonly PublicSitemapEntry[]): Response {
  return new Response(renderPublicSitemapXml(entries), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=60',
    },
  });
}

export function unavailablePublicSitemapResponse(surface: string, error?: unknown): Response {
  console.error('[public-sitemap] inventory unavailable', {
    surface,
    errorType: error instanceof Error ? error.name : typeof error,
  });

  return new Response('Service temporarily unavailable.\n', {
    status: 503,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': '300',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
