import type { PublicContentListRow } from './public-content-data';

export const CANONICAL_PUBLIC_ORIGIN = 'https://getgeopulse.com';

export function canonicalPublicOrigin(value: string | null | undefined): string {
  if (!value?.trim()) return CANONICAL_PUBLIC_ORIGIN;
  try {
    const url = new URL(value);
    if (url.hostname === 'getgeopulse.com' || url.hostname === 'www.getgeopulse.com') {
      return CANONICAL_PUBLIC_ORIGIN;
    }
  } catch {
    // Production inventories must never inherit a malformed or tracking origin.
  }
  return CANONICAL_PUBLIC_ORIGIN;
}

export function isUrlSafeArticleSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function isIndexablePublishedArticle(article: PublicContentListRow): boolean {
  if (!article.published_at || !isUrlSafeArticleSlug(article.slug)) return false;
  const canonicalPath = `/blog/${article.slug}`;
  if (!article.canonical_url) return true;
  if (article.canonical_url === canonicalPath) return true;
  try {
    const canonical = new URL(article.canonical_url, CANONICAL_PUBLIC_ORIGIN);
    return canonical.origin === CANONICAL_PUBLIC_ORIGIN && canonical.pathname === canonicalPath;
  } catch {
    return false;
  }
}

export function absolutePublicUrl(path: string): string {
  return new URL(path, `${CANONICAL_PUBLIC_ORIGIN}/`).toString();
}
