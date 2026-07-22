import { describe, expect, it } from 'vitest';
import { deriveReportStatus, DEEP_RUN_GENERATING_GRACE_MS } from './report-status';

const NOW = 1_700_000_000_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('deriveReportStatus', () => {
  it('delivered wins over everything', () => {
    expect(
      deriveReportStatus({ emailDelivered: true, hasReport: true, hasPaid: true, run: { started_at: iso(0) }, nowMs: NOW })
    ).toBe('delivered');
  });

  it('generating while a run is fresh (just queued, no timestamps but created_at)', () => {
    expect(
      deriveReportStatus({ emailDelivered: false, hasReport: false, hasPaid: false, run: { created_at: iso(1000) }, nowMs: NOW })
    ).toBe('generating');
  });

  it('generating while crawling (started recently, not completed)', () => {
    expect(
      deriveReportStatus({ emailDelivered: false, hasReport: false, hasPaid: false, run: { started_at: iso(60_000) }, nowMs: NOW })
    ).toBe('generating');
  });

  it('generating during the assembly window (completed recently, report not yet delivered)', () => {
    expect(
      deriveReportStatus({ emailDelivered: false, hasReport: true, hasPaid: false, run: { completed_at: iso(30_000) }, nowMs: NOW })
    ).toBe('generating');
  });

  it('P1 #3: a stale/failed run past the grace window is NOT generating (fails promptly)', () => {
    expect(
      deriveReportStatus({
        emailDelivered: false,
        hasReport: false,
        hasPaid: false,
        run: { started_at: iso(DEEP_RUN_GENERATING_GRACE_MS + 60_000), completed_at: null },
        nowMs: NOW,
      })
    ).toBe('none');
  });

  it('no run and not paid → none', () => {
    expect(
      deriveReportStatus({ emailDelivered: false, hasReport: false, hasPaid: false, run: null, nowMs: NOW })
    ).toBe('none');
  });

  it('paid but run not yet materialized → generating (queue latency)', () => {
    expect(
      deriveReportStatus({ emailDelivered: false, hasReport: false, hasPaid: true, run: null, nowMs: NOW })
    ).toBe('generating');
  });

  it('an existing report keeps it generating even if the run row looks stale', () => {
    expect(
      deriveReportStatus({
        emailDelivered: false,
        hasReport: true,
        hasPaid: false,
        run: { completed_at: iso(DEEP_RUN_GENERATING_GRACE_MS + 60_000) },
        nowMs: NOW,
      })
    ).toBe('generating');
  });
});
