export type PublishableContentSnapshot = {
  readonly content_type: string;
  readonly slug: string | null;
  readonly title: string | null;
  readonly status: string | null;
  readonly topic_cluster: string | null;
  readonly cta_goal: string | null;
  readonly source_type: string | null;
  readonly source_links: readonly string[];
  readonly draft_markdown: string | null;
  readonly canonical_url: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly published_at: string | null;
  readonly updated_at?: string | null;
};

export type ContentPublishCheck = {
  readonly key: string;
  readonly label: string;
  readonly category:
    | 'publish_contract'
    | 'llm_readiness'
    | 'claim_discipline'
    | 'semantic_quality';
  readonly passed: boolean;
  readonly hint?: string;
};

const VAGUE_HEADING_PATTERNS: RegExp[] = [
  /^a new era begins$/i,
  /^the future of discoverability$/i,
  /^why this matters more than ever$/i,
];

const QUESTION_OR_DECISION_HEADING_PATTERN =
  /\b(what|why|how|when|which|checklist|mistake|compare|vs|means)\b/i;

const OVERCLAIM_PATTERNS: RegExp[] = [
  /\bguarantee(?:d)?\s+(?:citations?|rankings?|visibility)\b/i,
  /\b100%\s+(?:citation|ranking|visibility)\b/i,
  /\bproven\s+to\s+rank\b/i,
];

function readMetadataString(metadata: Record<string, unknown> | null, key: string): string | null {
  if (!metadata) return null;
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isHttpUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getH2Headings(markdown: string): string[] {
  const matches = markdown.match(/^##\s+.+$/gm) ?? [];
  return matches.map((value) => value.replace(/^##\s+/, '').trim()).filter(Boolean);
}

function countAnswerBlocks(markdown: string): number {
  const h2Count = (markdown.match(/^##\s+.+$/gm) ?? []).length;
  const h3Count = (markdown.match(/^###\s+.+$/gm) ?? []).length;
  const listCount = (markdown.match(/^(?:- |\* |\d+\.\s).+$/gm) ?? []).length;
  const blockquoteCount = (markdown.match(/^>\s+.+$/gm) ?? []).length;
  return h2Count + h3Count + Math.floor(listCount / 2) + blockquoteCount;
}

function hasInternalBlogLink(markdown: string): boolean {
  const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(markdownLinkPattern)) {
    const href = match[1]?.trim() ?? '';
    if (
      href.startsWith('/blog/') ||
      href.startsWith('/blog/topic/') ||
      href.startsWith('https://getgeopulse.com/blog/')
    ) {
      return true;
    }
  }

  return false;
}

function hasExternalCitationLink(markdown: string): boolean {
  const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(markdownLinkPattern)) {
    const href = match[1]?.trim() ?? '';
    if (href.startsWith('https://') && !href.startsWith('https://getgeopulse.com/')) {
      return true;
    }
  }

  return false;
}

function hasQuantifiedClaim(markdown: string): boolean {
  return /\b\d+(?:\.\d+)?%\b/.test(markdown) || /\b\d{4}\b/.test(markdown);
}

function hasTimeSensitivePhrasing(markdown: string): boolean {
  return /\b(latest|currently|today|this year|right now|as of)\b/i.test(markdown);
}

function parseDateSafe(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getFreshnessAgeDays(value: string | null | undefined): number | null {
  const parsed = parseDateSafe(value);
  if (!parsed) return null;
  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function evaluateTerminologyConsistency(markdown: string): {
  readonly passed: boolean;
  readonly hint?: string;
} {
  const aliases = [
    { key: 'ai_search_readiness', pattern: /\bai search readiness\b/i },
    { key: 'aeo', pattern: /\baeo\b/i },
    { key: 'geo', pattern: /\bgeo\b/i },
    { key: 'ai_seo', pattern: /\bai seo\b/i },
    { key: 'llm_optimization', pattern: /\bllm optimization\b/i },
  ];

  const matched = aliases.filter((alias) => alias.pattern.test(markdown));
  if (matched.length <= 1) {
    return { passed: true };
  }

  const hasClarifier =
    /\b(in this article|we use|defined as|by .* we mean|here, .* means)\b/i.test(markdown);
  if (hasClarifier) {
    return { passed: true };
  }

  return {
    passed: false,
    hint:
      'Terminology is mixed without clarification; define one primary term and explain aliases once.',
  };
}

function buildCheck(args: {
  readonly key: string;
  readonly label: string;
  readonly category: ContentPublishCheck['category'];
  readonly passed: boolean;
  readonly hint?: string;
}): ContentPublishCheck {
  return args;
}

export function buildCanonicalContentUrl(contentType: string, slug: string | null): string | null {
  const normalizedSlug = slug?.trim() ?? '';
  if (!normalizedSlug) return null;
  if (contentType !== 'article') return null;
  return `/blog/${normalizedSlug}`;
}

export function evaluateContentPublishChecks(item: PublishableContentSnapshot): ContentPublishCheck[] {
  const checks: ContentPublishCheck[] = [];
  const markdown = item.draft_markdown?.trim() ?? '';
  const headings = markdown ? getH2Headings(markdown) : [];

  checks.push(
    buildCheck({
      key: 'content_type',
      label: 'Content type is article',
      category: 'publish_contract',
      passed: item.content_type === 'article',
      hint: 'Only article content items can be published to the public blog in this slice.',
    })
  );
  checks.push(
    buildCheck({
      key: 'title',
      label: 'Title is present',
      category: 'publish_contract',
      passed: Boolean(item.title?.trim()),
      hint: 'Title is required.',
    })
  );
  checks.push(
    buildCheck({
      key: 'slug',
      label: 'Slug is present',
      category: 'publish_contract',
      passed: Boolean(item.slug?.trim()),
      hint: 'Slug is required.',
    })
  );
  checks.push(
    buildCheck({
      key: 'topic_cluster',
      label: 'Topic cluster is set',
      category: 'publish_contract',
      passed: Boolean(item.topic_cluster?.trim()),
      hint: 'Topic cluster is required.',
    })
  );
  checks.push(
    buildCheck({
      key: 'draft_markdown',
      label: 'Draft markdown is present',
      category: 'publish_contract',
      passed: Boolean(markdown),
      hint: 'Draft markdown is required.',
    })
  );
  checks.push(
    buildCheck({
      key: 'cta_goal',
      label: 'CTA goal is set',
      category: 'publish_contract',
      passed: Boolean(item.cta_goal?.trim()),
      hint: 'CTA goal is required.',
    })
  );
  checks.push(
    buildCheck({
      key: 'source_type',
      label: 'Source type is set',
      category: 'publish_contract',
      passed: Boolean(item.source_type?.trim()),
      hint: 'Source type is required.',
    })
  );
  checks.push(
    buildCheck({
      key: 'source_links',
      label: 'At least one source link exists',
      category: 'publish_contract',
      passed: item.source_links.length > 0,
      hint: 'At least one source link is required.',
    })
  );

  const authorName = readMetadataString(item.metadata, 'author_name');
  checks.push(
    buildCheck({
      key: 'author_name',
      label: 'Author name is set',
      category: 'publish_contract',
      passed: Boolean(authorName),
      hint: 'Author name is required.',
    })
  );
  const authorRole = readMetadataString(item.metadata, 'author_role');
  checks.push(
    buildCheck({
      key: 'author_role',
      label: 'Author role is set',
      category: 'publish_contract',
      passed: Boolean(authorRole),
      hint: 'Author role is required.',
    })
  );
  const heroImageUrl = readMetadataString(item.metadata, 'hero_image_url');
  checks.push(
    buildCheck({
      key: 'hero_image_url',
      label: 'Hero image URL is set',
      category: 'publish_contract',
      passed: Boolean(heroImageUrl),
      hint: 'Hero image URL is required.',
    })
  );
  checks.push(
    buildCheck({
      key: 'hero_image_url_absolute',
      label: 'Hero image URL is absolute http(s)',
      category: 'publish_contract',
      passed: heroImageUrl ? isHttpUrl(heroImageUrl) : true,
      hint: 'Hero image URL must be an absolute http(s) URL.',
    })
  );
  const heroImageAlt = readMetadataString(item.metadata, 'hero_image_alt');
  checks.push(
    buildCheck({
      key: 'hero_image_alt',
      label: 'Hero image alt text is set',
      category: 'publish_contract',
      passed: Boolean(heroImageAlt),
      hint: 'Hero image alt text is required.',
    })
  );
  checks.push(
    buildCheck({
      key: 'noindex_disabled',
      label: '`noindex` is disabled for publish',
      category: 'publish_contract',
      passed: item.metadata?.['noindex'] !== true,
      hint: 'Article cannot be published while noindex is enabled.',
    })
  );

  if (markdown) {
    checks.push(
      buildCheck({
        key: 'llm_h2_count',
        label: 'Has at least two concrete H2 headings',
        category: 'llm_readiness',
        passed: headings.length >= 2,
        hint: 'Add at least two concrete H2 subtopic headings for extractable structure.',
      })
    );
    checks.push(
      buildCheck({
        key: 'llm_question_heading',
        label: 'Has at least one question/decision-oriented H2',
        category: 'llm_readiness',
        passed:
          headings.length > 0 &&
          headings.some((heading) => QUESTION_OR_DECISION_HEADING_PATTERN.test(heading)),
        hint: 'At least one H2 heading should reflect a real question or decision.',
      })
    );
    const vagueHeading = headings.find((heading) =>
      VAGUE_HEADING_PATTERNS.some((pattern) => pattern.test(heading))
    );
    checks.push(
      buildCheck({
        key: 'llm_vague_heading',
        label: 'Avoids vague editorial headings',
        category: 'llm_readiness',
        passed: !vagueHeading,
        hint: vagueHeading
          ? `Replace vague heading "${vagueHeading}" with concrete, extractable language.`
          : undefined,
      })
    );
    checks.push(
      buildCheck({
        key: 'llm_answer_blocks',
        label: 'Has at least two answer-friendly blocks',
        category: 'llm_readiness',
        passed: countAnswerBlocks(markdown) >= 2,
        hint: 'Add at least two answer-friendly blocks (lists, H3 blocks, or concise callouts).',
      })
    );
    checks.push(
      buildCheck({
        key: 'llm_internal_blog_link',
        label: 'Includes at least one internal /blog link in body',
        category: 'llm_readiness',
        passed: hasInternalBlogLink(markdown),
        hint: 'Add at least one internal /blog link in the article body for topic graph clarity.',
      })
    );
    const overclaimPattern = OVERCLAIM_PATTERNS.find((pattern) => pattern.test(markdown));
    checks.push(
      buildCheck({
        key: 'claim_discipline_overclaim',
        label: 'Avoids absolute performance overclaims',
        category: 'claim_discipline',
        passed: !overclaimPattern,
        hint: overclaimPattern
          ? 'Remove absolute performance claims; keep recommendation language bounded to evidence.'
          : undefined,
      })
    );

    checks.push(
      buildCheck({
        key: 'semantic_claim_source_alignment',
        label: 'Quantified claims are paired with external source links',
        category: 'semantic_quality',
        passed: !hasQuantifiedClaim(markdown) || hasExternalCitationLink(markdown),
        hint:
          'Add at least one external citation link in-body when making quantified/date-specific claims.',
      })
    );

    const freshnessAgeDays = getFreshnessAgeDays(item.updated_at);
    checks.push(
      buildCheck({
        key: 'semantic_freshness_drift',
        label: 'Time-sensitive phrasing matches recent update freshness',
        category: 'semantic_quality',
        passed:
          !hasTimeSensitivePhrasing(markdown) ||
          (freshnessAgeDays !== null && freshnessAgeDays <= 120),
        hint:
          'Article uses time-sensitive phrasing but appears stale; update content date or remove time-bound wording.',
      })
    );

    const terminologyConsistency = evaluateTerminologyConsistency(markdown);
    checks.push(
      buildCheck({
        key: 'semantic_terminology_consistency',
        label: 'Terminology is consistent or explicitly clarified',
        category: 'semantic_quality',
        passed: terminologyConsistency.passed,
        hint: terminologyConsistency.hint,
      })
    );
  }

  return checks;
}

export function getContentPublishIssues(item: PublishableContentSnapshot): string[] {
  return evaluateContentPublishChecks(item)
    .filter((check) => !check.passed)
    .map((check) => check.hint ?? `${check.label}.`);
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
