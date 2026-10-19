import { describe, expect, it, vi } from 'vitest';
import {
  publishedArticlePath,
  resolvePublishedArticleContentId,
} from './marketing-session-attribution';

function contentDb(result: { data: unknown; error: unknown }) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  return { db: { from: vi.fn(() => chain) }, chain };
}

describe('marketing session attribution', () => {
  it('accepts only canonical public article paths', () => {
    expect(publishedArticlePath('/blog/msp-remote-support-page-evidence')).toBe(
      '/blog/msp-remote-support-page-evidence'
    );
    expect(publishedArticlePath('/blog/msp-proof/')).toBe('/blog/msp-proof');
    expect(publishedArticlePath('/blog/msp-proof?utm_source=test')).toBe('/blog/msp-proof');
    expect(publishedArticlePath('/blog/topic/msp')).toBeNull();
    expect(publishedArticlePath('/dashboard')).toBeNull();
    expect(publishedArticlePath('/blog/raw%20label')).toBeNull();
  });

  it('resolves only a published article at the exact canonical path', async () => {
    const { db, chain } = contentDb({
      data: { content_id: 'seo-agent:msp-remote-support-page-evidence-grounded-v1' },
      error: null,
    });

    await expect(
      resolvePublishedArticleContentId(db, '/blog/msp-remote-support-page-evidence')
    ).resolves.toBe('seo-agent:msp-remote-support-page-evidence-grounded-v1');
    expect(db.from).toHaveBeenCalledWith('content_items');
    expect(chain.eq).toHaveBeenCalledWith(
      'canonical_url',
      '/blog/msp-remote-support-page-evidence'
    );
    expect(chain.eq).toHaveBeenCalledWith('content_type', 'article');
    expect(chain.eq).toHaveBeenCalledWith('status', 'published');
  });

  it('fails closed without blocking the session beacon', async () => {
    const { db } = contentDb({ data: null, error: { message: 'unavailable' } });
    await expect(resolvePublishedArticleContentId(db, '/blog/msp-proof')).resolves.toBeNull();

    const throwingDb = { from: vi.fn(() => { throw new Error('offline'); }) };
    await expect(resolvePublishedArticleContentId(throwingDb, '/blog/msp-proof')).resolves.toBeNull();
  });
});
