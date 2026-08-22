import { describe, expect, it } from 'vitest';
import {
  completedDeepAuditScanFields,
  planDeepAuditCrawlRecovery,
  shouldDeliverReportEmail,
} from './report-queue-consumer';

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

describe('shouldDeliverReportEmail', () => {
  it('fails closed for campaign-preview report generation', () => {
    expect(shouldDeliverReportEmail({
      v: 3,
      scanId: 'scan-1',
      scanRunId: 'run-1',
      customerEmail: 'reports@getgeopulse.com',
      paymentId: 'campaign-preview:contact-1',
      stripeSessionId: 'campaign-preview',
      deliveryMode: 'campaign_preview',
    })).toBe(false);
  });

  it('preserves normal paid report delivery', () => {
    expect(shouldDeliverReportEmail({
      v: 2,
      scanId: 'scan-1',
      scanRunId: 'run-1',
      customerEmail: 'buyer@example.com',
      paymentId: 'payment-1',
      stripeSessionId: 'session-1',
    })).toBe(true);
  });
});

describe('completedDeepAuditScanFields', () => {
  it('makes a generated report discoverable as a completed scan', () => {
    expect(completedDeepAuditScanFields({
      score: 84,
      letterGrade: 'B',
      issues: [{ check: 'Buyer questions', passed: false }],
      fullResults: { deepAudit: true },
    })).toEqual({
      status: 'complete',
      score: 84,
      letter_grade: 'B',
      issues_json: [{ check: 'Buyer questions', passed: false }],
      full_results_json: { deepAudit: true },
    });
  });
});
