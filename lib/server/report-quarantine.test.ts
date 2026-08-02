import { describe, expect, it } from 'vitest';
import { isClientReportSharingHeld, isReportQuarantined } from './report-quarantine';

describe('report quarantine', () => {
  it('fails closed only for the explicit audited quarantine marker', () => {
    expect(isReportQuarantined({ quarantine_status: 'quarantined' })).toBe(true);
    expect(isReportQuarantined({ quarantine_status: 'released' })).toBe(false);
    expect(isReportQuarantined({})).toBe(false);
    expect(isReportQuarantined(null)).toBe(false);
  });

  it('keeps public sharing off while an explicit client review hold is active', () => {
    expect(isClientReportSharingHeld({
      report_quarantine_hold: { status: 'held_pending_independent_review' },
    })).toBe(true);
    expect(isClientReportSharingHeld({ report_quarantine_hold: { status: 'held' } })).toBe(true);
    expect(isClientReportSharingHeld({ report_quarantine_hold: { status: 'released' } })).toBe(false);
    expect(isClientReportSharingHeld({})).toBe(false);
    expect(isClientReportSharingHeld(null)).toBe(false);
  });
});
