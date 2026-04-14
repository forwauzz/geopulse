import { describe, expect, it } from 'vitest';
import { buildImportedContentItems } from './content-draft-import';

describe('buildImportedContentItems', () => {
  it('builds stable content items from grouped draft assets', () => {
    const groups = new Map([
      [
        'ai-search-readiness-audit',
        {
          brief: {
            kind: 'brief',
            filename: '2026-03-31-ai-search-readiness-audit-brief.md',
            fullPath:
              'C:/repo/PLAYBOOK/content-machine-drafts/2026-03-31-ai-search-readiness-audit-brief.md',
            markdown: `# Article Brief

## Asset
- type: article
- target persona: SEO consultants
- working title: How to Audit Your Site for AI Search Readiness
- topic cluster: ai_search_readiness

## Problem
- core problem: many teams still do not know how to tell whether their site is actually understandable to AI search systems

## CTA
- primary CTA: free scan
`,
          },
          article: {
            kind: 'article',
            filename: '2026-03-31-ai-search-readiness-audit-article.md',
            fullPath:
              'C:/repo/PLAYBOOK/content-machine-drafts/2026-03-31-ai-search-readiness-audit-article.md',
            markdown: '# How to Audit Your Site for AI Search Readiness\n\nArticle body',
          },
          newsletter: {
            kind: 'newsletter',
            filename: '2026-03-31-ai-search-readiness-audit-newsletter.md',
            fullPath:
              'C:/repo/PLAYBOOK/content-machine-drafts/2026-03-31-ai-search-readiness-audit-newsletter.md',
            markdown: `# Newsletter Draft

## Subject ideas
- How to Audit Your Site for AI Search Readiness
`,
          },
        },
      ],
    ]) as any;

    const items = buildImportedContentItems(groups);

    expect(items).toEqual([
      expect.objectContaining({
        content_id: 'ai-search-readiness-audit-brief',
        slug: 'ai-search-readiness-audit-brief',
        title: 'Brief: How to Audit Your Site for AI Search Readiness',
        status: 'brief',
        content_type: 'brief',
        target_persona: 'SEO consultants',
        topic_cluster: 'ai_search_readiness',
        cta_goal: 'free_scan',
      }),
      expect.objectContaining({
        content_id: 'ai-search-readiness-audit-article',
        slug: 'ai-search-readiness-audit',
        title: 'How to Audit Your Site for AI Search Readiness',
        status: 'draft',
        content_type: 'article',
        topic_cluster: 'ai_search_readiness',
      }),
      expect.objectContaining({
        content_id: 'ai-search-readiness-audit-newsletter',
        slug: 'ai-search-readiness-audit-newsletter',
        title: 'How to Audit Your Site for AI Search Readiness',
        status: 'draft',
        content_type: 'newsletter',
        topic_cluster: 'ai_search_readiness',
      }),
    ]);
  });
});
