import { describe, expect, it } from 'vitest';
import { planDeepAuditCrawlRecovery } from './report-queue-consumer';

describe('planDeepAuditCrawlRecovery', () => {
  it('clears stale error-only rows before retrying a failed audit version', () => {
    expect(planDeepAuditCrawlRecovery(0, false)).toEqual({
      shouldRunCrawl: true,
      clearFailedPages: true,
    });
  });

  it('continues a chunked crawl without deleting its completed pages', () => {
    expect(planDeepAuditCrawlRecovery(4, true)).toEqual({
      shouldRunCrawl: true,
      clearFailedPages: false,
    });
  });

  it('reuses a completed crawl during an idempotent queue retry', () => {
    expect(planDeepAuditCrawlRecovery(4, false)).toEqual({
      shouldRunCrawl: false,
      clearFailedPages: false,
    });
  });
});
