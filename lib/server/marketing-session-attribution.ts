type ContentLookupDb = {
  from(table: string): any;
};

export function publishedArticlePath(landingPath: string | null | undefined): string | null {
  const path = landingPath?.trim();
  if (!path || path.length > 2048) return null;

  const withoutQuery = path.split(/[?#]/, 1)[0] ?? '';
  if (!/^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/i.test(withoutQuery)) return null;

  return withoutQuery.endsWith('/') ? withoutQuery.slice(0, -1) : withoutQuery;
}

/**
 * Resolve campaign lineage for a public article landing without trusting a
 * client-supplied content id. The analytics insert trigger inherits campaign
 * and intervention ids from the returned canonical content id.
 */
export async function resolvePublishedArticleContentId(
  db: ContentLookupDb,
  landingPath: string | null | undefined
): Promise<string | null> {
  const canonicalPath = publishedArticlePath(landingPath);
  if (!canonicalPath) return null;

  try {
    const { data, error } = await db
      .from('content_items')
      .select('content_id')
      .eq('canonical_url', canonicalPath)
      .eq('content_type', 'article')
      .eq('status', 'published')
      .maybeSingle();

    if (error || typeof data?.content_id !== 'string') return null;
    const contentId = data.content_id.trim();
    return contentId || null;
  } catch {
    // Attribution enrichment is best-effort and must never block a pageview.
    return null;
  }
}
