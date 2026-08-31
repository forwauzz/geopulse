import { describe, expect, it } from 'vitest';
import {
  AI_VISIBILITY_AUDIT_MARKDOWN,
  AI_VISIBILITY_AUDIT_META_DESCRIPTION,
  AI_VISIBILITY_AUDIT_SOURCES,
  AI_VISIBILITY_AUDIT_TITLE,
  buildAiVisibilityAuditRepair,
} from './repair-ai-visibility-audit';

describe('AI visibility audit repair', () => {
  it('builds a source-backed, publish-ready, conversion-safe replacement', () => {
    const repair = buildAiVisibilityAuditRepair(
      {
        id: '0b78a122-fa1c-444f-aad0-171d38ea0ee7',
        content_id: 'seo-agent:seo-ai-visibility-audit',
        slug: 'seo-ai-visibility-audit',
        title: 'Conducting an AI Visibility Audit for Small Businesses and Agencies',
        status: 'published',
        content_type: 'article',
        topic_cluster: 'ai visibility audit',
        cta_goal: 'free_scan',
        source_type: 'internal_plus_research',
        source_links: ['https://www.geopulse.com/blog/unlocking-geo'],
        draft_markdown: 'Thin previous article.',
        canonical_url: '/blog/seo-ai-visibility-audit',
        metadata: {
          author_name: 'Geo Team',
          author_role: 'Editorial Team',
          hero_image_url: 'https://cdn.example.com/hero.jpg',
          hero_image_alt: 'Editorial evidence collage',
        },
        published_at: '2026-07-28T01:01:54.240Z',
        updated_at: '2026-07-28T01:01:54.310209+00:00',
      },
      '2026-08-30T22:00:00.000Z'
    );

    expect(repair.publishIssues).toEqual([]);
    expect(repair.payload).toMatchObject({
      title: AI_VISIBILITY_AUDIT_TITLE,
      draft_markdown: AI_VISIBILITY_AUDIT_MARKDOWN,
      source_links: [...AI_VISIBILITY_AUDIT_SOURCES],
      metadata: {
        author_name: 'Uzziel T.',
        author_role: 'Founder, GEO-Pulse',
        meta_description: AI_VISIBILITY_AUDIT_META_DESCRIPTION,
      },
    });
    expect(AI_VISIBILITY_AUDIT_MARKDOWN).not.toMatch(/^#\s/m);
    expect(AI_VISIBILITY_AUDIT_MARKDOWN).not.toContain('https://www.geopulse.com');
    expect(AI_VISIBILITY_AUDIT_MARKDOWN).not.toContain('increase your chances');
  });
});
