import { describe, expect, it } from 'vitest';
import {
  CANONICAL_PUBLIC_ORIGIN,
  absolutePublicUrl,
  canonicalPublicOrigin,
  isIndexablePublishedArticle,
  isUrlSafeArticleSlug,
} from './public-indexing';
import type { PublicContentListRow } from './public-content-data';

function article(overrides: Partial<PublicContentListRow> = {}): PublicContentListRow {
  return {
    id: '1', content_id: 'a', slug: 'msp-ai-proof', title: 'MSP AI proof',
    target_persona: 'MSP owner', primary_problem: null, topic_cluster: 'msp proof',
    cta_goal: 'free_scan', canonical_url: '/blog/msp-ai-proof',
    published_at: '2026-08-12T00:00:00.000Z', updated_at: '2026-08-12T00:00:00.000Z',
    excerpt: null, metadata: {}, ...overrides,
  };
}

describe('public indexing inventory', () => {
  it('never emits the tracking host or an arbitrary configured origin', () => {
    expect(canonicalPublicOrigin('https://track.getgeopulse.com')).toBe(CANONICAL_PUBLIC_ORIGIN);
    expect(canonicalPublicOrigin('https://preview.example.workers.dev')).toBe(CANONICAL_PUBLIC_ORIGIN);
    expect(absolutePublicUrl('/blog/msp-ai-proof')).toBe('https://getgeopulse.com/blog/msp-ai-proof');
  });

  it('accepts only URL-safe, published, canonical article rows', () => {
    expect(isUrlSafeArticleSlug('msp-ai-proof')).toBe(true);
    expect(isUrlSafeArticleSlug('msp proof.png')).toBe(false);
    expect(isIndexablePublishedArticle(article())).toBe(true);
    expect(isIndexablePublishedArticle(article({ published_at: null }))).toBe(false);
    expect(isIndexablePublishedArticle(article({ slug: 'deleted article.pdf' }))).toBe(false);
    expect(isIndexablePublishedArticle(article({ canonical_url: 'https://track.getgeopulse.com/blog/msp-ai-proof' }))).toBe(false);
    expect(isIndexablePublishedArticle(article({ canonical_url: '/blog/replaced-article' }))).toBe(false);
  });
});
