export const DEFAULT_CHUNK_SIZE = 25;
export const MAX_CHUNK_SIZE = 40;

export type CrawlPendingState = {
  readonly ordered_urls: readonly string[];
  readonly next_index: number;
  readonly chunk_size: number;
  readonly crawl_delay_ms: number;
  readonly sitemap_norms: readonly string[];
  readonly seed_norm: string;
  readonly robots_status: number;
  readonly sitemap_urls_considered: number;
  readonly chunks_processed: number;
  readonly started_at: string | null;
  readonly browser_render_attempted: number;
  readonly browser_render_succeeded: number;
  readonly browser_render_failed: number;
  readonly browser_render_browser_ms_used: number;
};

export type BrowserRenderStats = {
  attempted: number;
  succeeded: number;
  failed: number;
  browserMsUsed: number;
};

export function parseCrawlPending(raw: unknown): CrawlPendingState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o['ordered_urls']) || typeof o['next_index'] !== 'number') return null;
  const urls = o['ordered_urls'] as unknown[];
  if (!urls.every((u) => typeof u === 'string')) return null;
  if (typeof o['crawl_delay_ms'] !== 'number') return null;
  if (!Array.isArray(o['sitemap_norms'])) return null;
  const sitemapNorms = o['sitemap_norms'] as unknown[];
  if (!sitemapNorms.every((s) => typeof s === 'string')) return null;
  if (typeof o['seed_norm'] !== 'string') return null;

  return {
    ordered_urls: urls as string[],
    next_index: o['next_index'] as number,
    chunk_size:
      typeof o['chunk_size'] === 'number' && o['chunk_size'] > 0
        ? (o['chunk_size'] as number)
        : DEFAULT_CHUNK_SIZE,
    crawl_delay_ms: o['crawl_delay_ms'] as number,
    sitemap_norms: sitemapNorms as string[],
    seed_norm: o['seed_norm'] as string,
    robots_status: typeof o['robots_status'] === 'number' ? (o['robots_status'] as number) : 200,
    sitemap_urls_considered:
      typeof o['sitemap_urls_considered'] === 'number'
        ? (o['sitemap_urls_considered'] as number)
        : 1,
    chunks_processed:
      typeof o['chunks_processed'] === 'number' && o['chunks_processed'] > 0
        ? (o['chunks_processed'] as number)
        : 1,
    started_at:
      typeof o['started_at'] === 'string' && o['started_at'].length > 0
        ? (o['started_at'] as string)
        : null,
    browser_render_attempted:
      typeof o['browser_render_attempted'] === 'number' && o['browser_render_attempted'] >= 0
        ? (o['browser_render_attempted'] as number)
        : 0,
    browser_render_succeeded:
      typeof o['browser_render_succeeded'] === 'number' && o['browser_render_succeeded'] >= 0
        ? (o['browser_render_succeeded'] as number)
        : 0,
    browser_render_failed:
      typeof o['browser_render_failed'] === 'number' && o['browser_render_failed'] >= 0
        ? (o['browser_render_failed'] as number)
        : 0,
    browser_render_browser_ms_used:
      typeof o['browser_render_browser_ms_used'] === 'number' &&
      o['browser_render_browser_ms_used'] >= 0
        ? (o['browser_render_browser_ms_used'] as number)
        : 0,
  };
}

export function mergeBrowserRenderStats(
  base: BrowserRenderStats,
  delta: BrowserRenderStats
): BrowserRenderStats {
  return {
    attempted: base.attempted + delta.attempted,
    succeeded: base.succeeded + delta.succeeded,
    failed: base.failed + delta.failed,
    browserMsUsed: base.browserMsUsed + delta.browserMsUsed,
  };
}

export function mergeConfig(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, ...patch };
}

export function planPendingContinuation(
  pending: CrawlPendingState,
  limit: number,
  chunkSize: number
):
  | {
      ok: true;
      ordered: string[];
      start: number;
      end: number;
      chunksProcessed: number;
    }
  | { ok: false; reason: 'crawl_pending_invalid_chunks_processed' | 'crawl_pending_exhausted' } {
  const ordered = pending.ordered_urls.slice(0, limit);
  const start = Math.max(0, pending.next_index);
  const chunksProcessed = Math.max(1, pending.chunks_processed);
  const maxChunks = Math.max(1, Math.ceil(limit / Math.max(1, chunkSize))) + 2;

  if (chunksProcessed > maxChunks) {
    return { ok: false, reason: 'crawl_pending_invalid_chunks_processed' };
  }

  if (start >= ordered.length) {
    return { ok: false, reason: 'crawl_pending_exhausted' };
  }

  return {
    ok: true,
    ordered,
    start,
    end: Math.min(start + chunkSize, ordered.length),
    chunksProcessed,
  };
}
