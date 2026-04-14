import { describe, expect, it } from 'vitest';
import {
  mergeBrowserRenderStats,
  parseCrawlPending,
  planPendingContinuation,
} from './deep-audit-crawl-state';

describe('deep-audit-crawl-state', () => {
  it('parses legacy crawl_pending payloads with defaults', () => {
    const parsed = parseCrawlPending({
      ordered_urls: ['https://example.com/'],
      next_index: 1,
      chunk_size: 25,
      crawl_delay_ms: 0,
      sitemap_norms: [],
      seed_norm: 'https://example.com/',
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.robots_status).toBe(200);
    expect(parsed?.chunks_processed).toBe(1);
    expect(parsed?.browser_render_attempted).toBe(0);
  });

  it('plans the next continuation window and guards invalid pending state', () => {
    const pending = parseCrawlPending({
      ordered_urls: ['https://example.com/', 'https://example.com/a', 'https://example.com/b'],
      next_index: 1,
      chunk_size: 2,
      crawl_delay_ms: 0,
      sitemap_norms: [],
      seed_norm: 'https://example.com/',
      chunks_processed: 2,
    });

    if (!pending) {
      throw new Error('expected_pending_state');
    }

    expect(planPendingContinuation(pending, 3, 2)).toEqual({
      ok: true,
      ordered: ['https://example.com/', 'https://example.com/a', 'https://example.com/b'],
      start: 1,
      end: 3,
      chunksProcessed: 2,
    });

    expect(
      planPendingContinuation(
        {
          ...pending,
          chunks_processed: 99,
        },
        3,
        2
      )
    ).toEqual({ ok: false, reason: 'crawl_pending_invalid_chunks_processed' });
  });

  it('merges browser rendering counters cumulatively', () => {
    expect(
      mergeBrowserRenderStats(
        { attempted: 1, succeeded: 1, failed: 0, browserMsUsed: 100 },
        { attempted: 2, succeeded: 1, failed: 1, browserMsUsed: 250 }
      )
    ).toEqual({
      attempted: 3,
      succeeded: 2,
      failed: 1,
      browserMsUsed: 350,
    });
  });
});
