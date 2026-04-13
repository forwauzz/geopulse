type SupabaseLike = {
  from(table: string): any;
};

export type PublicContentListRow = {
  readonly id: string;
  readonly content_id: string;
  readonly slug: string;
  readonly title: string;
  readonly target_persona: string | null;
  readonly primary_problem: string | null;
  readonly topic_cluster: string | null;
  readonly cta_goal: string;
  readonly canonical_url: string | null;
  readonly published_at: string | null;
  readonly updated_at: string;
  readonly excerpt: string | null;
  readonly metadata: Record<string, unknown>;
};

export type PublicContentDetailRow = {
  readonly id: string;
  readonly content_id: string;
  readonly slug: string;
  readonly title: string;
  readonly target_persona: string | null;
  readonly primary_problem: string | null;
  readonly topic_cluster: string | null;
  readonly keyword_cluster: string | null;
  readonly cta_goal: string;
  readonly source_links: string[];
  readonly draft_markdown: string;
  readonly canonical_url: string | null;
  readonly metadata: Record<string, unknown>;
  readonly published_at: string | null;
  readonly updated_at: string;
};

function isE2eBlogFixtureEnabled(): boolean {
  return process.env['E2E_BLOG_FIXTURE'] === '1';
}

const E2E_BLOG_FIXTURE_DETAIL_ROWS: readonly PublicContentDetailRow[] = [
  {
    id: 'e2e-blog-item-1',
    content_id: 'e2e-blog-item-1',
    slug: 'e2e-blog-dark-theme',
    title: 'E2E Blog Dark Theme Fixture',
    target_persona: 'operators',
    primary_problem: 'Teams need deterministic visual QA checks for blog theming.',
    topic_cluster: 'ai_search_readiness',
    keyword_cluster: 'theme_qa',
    cta_goal: 'free_scan',
    source_links: ['https://example.com/e2e-fixture-source'],
    draft_markdown: [
      '## Why this fixture exists',
      '',
      'This fixture gives Playwright a stable public blog artifact for style checks.',
      '',
      '## What to verify',
      '',
      '- Light blog surfaces',
      '- Readable body text',
      '- High-contrast link/focus behavior',
    ].join('\n'),
    canonical_url: '/blog/e2e-blog-dark-theme',
    metadata: {
      author_name: 'GEO-Pulse QA',
      author_role: 'Automation',
      hero_image_url: 'https://images.unsplash.com/photo-1518770660439-4636190af475',
      hero_image_alt: 'Abstract dark gradient lines',
    },
    published_at: '2026-04-03T12:00:00.000Z',
    updated_at: '2026-04-03T12:00:00.000Z',
  },
];

const E2E_BLOG_FIXTURE_LIST_ROWS: readonly PublicContentListRow[] = E2E_BLOG_FIXTURE_DETAIL_ROWS.map(
  (row) => ({
    id: row.id,
    content_id: row.content_id,
    slug: row.slug,
    title: row.title,
    target_persona: row.target_persona,
    primary_problem: row.primary_problem,
    topic_cluster: row.topic_cluster,
    cta_goal: row.cta_goal,
    canonical_url: row.canonical_url,
    published_at: row.published_at,
    updated_at: row.updated_at,
    excerpt: buildExcerpt(row.draft_markdown),
    metadata: row.metadata,
  })
);

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_>~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildExcerpt(markdown: string | null): string | null {
  const text = markdown ? stripMarkdown(markdown) : '';
  if (!text) return null;
  return text.length <= 220 ? text : `${text.slice(0, 217).trimEnd()}...`;
}

export function createPublicContentData(supabase: SupabaseLike) {
  return {
    async getPublishedArticles(): Promise<PublicContentListRow[]> {
      if (isE2eBlogFixtureEnabled()) {
        return [...E2E_BLOG_FIXTURE_LIST_ROWS];
      }

      const { data, error } = await supabase
        .from('content_items')
        .select(
          'id,content_id,slug,title,target_persona,primary_problem,topic_cluster,cta_goal,canonical_url,published_at,updated_at,draft_markdown,metadata'
        )
        .eq('content_type', 'article')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        content_id: String(row.content_id),
        slug: String(row.slug),
        title: String(row.title),
        target_persona: (row.target_persona as string | null) ?? null,
        primary_problem: (row.primary_problem as string | null) ?? null,
        topic_cluster: (row.topic_cluster as string | null) ?? null,
        cta_goal: String(row.cta_goal),
        canonical_url: (row.canonical_url as string | null) ?? null,
        published_at: (row.published_at as string | null) ?? null,
        updated_at: String(row.updated_at),
        excerpt: buildExcerpt((row.draft_markdown as string | null) ?? null),
        metadata: (row.metadata as Record<string, unknown> | null) ?? {},
      }));
    },

    async getPublishedArticleBySlug(slug: string): Promise<PublicContentDetailRow | null> {
      if (isE2eBlogFixtureEnabled()) {
        const fixture = E2E_BLOG_FIXTURE_DETAIL_ROWS.find((row) => row.slug === slug) ?? null;
        return fixture ? { ...fixture } : null;
      }

      const { data, error } = await supabase
        .from('content_items')
        .select(
          'id,content_id,slug,title,target_persona,primary_problem,topic_cluster,keyword_cluster,cta_goal,source_links,draft_markdown,canonical_url,metadata,published_at,updated_at'
        )
        .eq('content_type', 'article')
        .eq('status', 'published')
        .eq('slug', slug)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as Record<string, unknown>;
      const draftMarkdown = typeof row.draft_markdown === 'string' ? row.draft_markdown : '';
      if (!draftMarkdown.trim()) return null;

      return {
        id: String(row.id),
        content_id: String(row.content_id),
        slug: String(row.slug),
        title: String(row.title),
        target_persona: (row.target_persona as string | null) ?? null,
        primary_problem: (row.primary_problem as string | null) ?? null,
        topic_cluster: (row.topic_cluster as string | null) ?? null,
        keyword_cluster: (row.keyword_cluster as string | null) ?? null,
        cta_goal: String(row.cta_goal),
        source_links: Array.isArray(row.source_links) ? (row.source_links as string[]) : [],
        draft_markdown: draftMarkdown,
        canonical_url: (row.canonical_url as string | null) ?? null,
        metadata: (row.metadata as Record<string, unknown> | null) ?? {},
        published_at: (row.published_at as string | null) ?? null,
        updated_at: String(row.updated_at),
      };
    },
  };
}
