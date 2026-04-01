export type PublishableContentSnapshot = {
  readonly content_type: string;
  readonly slug: string | null;
  readonly title: string | null;
  readonly status: string | null;
  readonly cta_goal: string | null;
  readonly source_type: string | null;
  readonly source_links: readonly string[];
  readonly draft_markdown: string | null;
  readonly canonical_url: string | null;
  readonly published_at: string | null;
};

export function buildCanonicalContentUrl(contentType: string, slug: string | null): string | null {
  const normalizedSlug = slug?.trim() ?? '';
  if (!normalizedSlug) return null;
  if (contentType !== 'article') return null;
  return `/blog/${normalizedSlug}`;
}

export function getContentPublishIssues(item: PublishableContentSnapshot): string[] {
  const issues: string[] = [];

  if (item.content_type !== 'article') {
    issues.push('Only article content items can be published to the public blog in this slice.');
  }

  if (!(item.title?.trim() ?? '')) {
    issues.push('Title is required.');
  }

  if (!(item.slug?.trim() ?? '')) {
    issues.push('Slug is required.');
  }

  if (!item.draft_markdown?.trim()) {
    issues.push('Draft markdown is required.');
  }

  if (!item.cta_goal?.trim()) {
    issues.push('CTA goal is required.');
  }

  if (!item.source_type?.trim()) {
    issues.push('Source type is required.');
  }

  if (item.source_links.length === 0) {
    issues.push('At least one source link is required.');
  }

  return issues;
}

export function prepareContentForPublish(item: PublishableContentSnapshot): {
  readonly canonicalUrl: string | null;
  readonly publishedAt: string;
} {
  const issues = getContentPublishIssues(item);
  if (issues.length > 0) {
    throw new Error(`Cannot publish content item. ${issues.join(' ')}`);
  }

  return {
    canonicalUrl: buildCanonicalContentUrl(item.content_type, item.slug),
    publishedAt: item.published_at ?? new Date().toISOString(),
  };
}
