import { describe, expect, it } from 'vitest';
import { isReportQuarantined } from './report-quarantine';

describe('report quarantine', () => {
  it('fails closed only for the explicit audited quarantine marker', () => {
    expect(isReportQuarantined({ quarantine_status: 'quarantined' })).toBe(true);
    expect(isReportQuarantined({ quarantine_status: 'released' })).toBe(false);
    expect(isReportQuarantined({})).toBe(false);
    expect(isReportQuarantined(null)).toBe(false);
  });
});
