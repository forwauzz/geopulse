/**
 * Live progress for a running deep audit, derived from what the crawl has actually persisted —
 * `scan_pages` rows accumulate as pages are fetched, so "done / total" and "which URL is being
 * reviewed" are read, never simulated.
 */

export type ScanProgress = {
  readonly phase: 'crawling' | 'finishing' | 'unknown';
  /** 0..100, monotone-friendly for a progress bar. */
  readonly percent: number;
  readonly pagesDone: number;
  readonly pageLimit: number | null;
  /** Human line for the overlay, e.g. "Reviewing https://site.com/pricing". */
  readonly detail: string | null;
};

export function buildScanProgress(args: {
  readonly pageLimit: number | null;
  readonly pagesDone: number;
  readonly latestPageUrl: string | null;
  readonly reportDelivered: boolean;
}): ScanProgress {
  const pagesDone = Math.max(0, args.pagesDone);
  const pageLimit = args.pageLimit && args.pageLimit > 0 ? args.pageLimit : null;

  if (args.reportDelivered) {
    return { phase: 'finishing', percent: 100, pagesDone, pageLimit, detail: 'Report ready' };
  }

  if (pageLimit === null) {
    return {
      phase: 'unknown',
      percent: pagesDone > 0 ? 50 : 10,
      pagesDone,
      pageLimit: null,
      detail: args.latestPageUrl ? `Reviewing ${args.latestPageUrl}` : null,
    };
  }

  // Crawling advances 5% → 90%; the last 10% is scoring + report assembly + delivery, which we
  // cannot subdivide honestly, so the bar simply holds at 90 with a "finishing" phase.
  const crawlRatio = Math.min(1, pagesDone / pageLimit);
  const percent = Math.round(5 + crawlRatio * 85);
  const crawlDone = pagesDone >= pageLimit;

  return {
    phase: crawlDone ? 'finishing' : 'crawling',
    percent: crawlDone ? 90 : percent,
    pagesDone,
    pageLimit,
    detail: crawlDone
      ? 'Scoring pages and assembling your report'
      : args.latestPageUrl
        ? `Reviewing ${args.latestPageUrl}`
        : 'Discovering pages to review',
  };
}
