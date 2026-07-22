import { describe, expect, it } from 'vitest';
import { isConfirmedFail } from './outreach';

/**
 * The outreach scorecard email must never lead with a shaky finding (spec §16.2 / §18): only a
 * HIGH/MEDIUM-confidence FAIL is a "confirmed" fail worth headlining a cold email.
 */
describe('isConfirmedFail — outreach email headline eligibility', () => {
  it('accepts a confirmed FAIL', () => {
    expect(isConfirmedFail({ status: 'FAIL', confidence: 'high' })).toBe(true);
    expect(isConfirmedFail({ status: 'FAIL', confidence: 'medium' })).toBe(true);
  });

  it('accepts a legacy issue with no status but passed === false', () => {
    expect(isConfirmedFail({ passed: false })).toBe(true);
  });

  it('rejects NOT_TESTED / NOT_EVALUATED / BLOCKED — never a failure to a prospect', () => {
    expect(isConfirmedFail({ status: 'NOT_TESTED', passed: false })).toBe(false);
    expect(isConfirmedFail({ status: 'NOT_EVALUATED', passed: false })).toBe(false);
    expect(isConfirmedFail({ status: 'BLOCKED', passed: false })).toBe(false);
  });

  it('rejects low-confidence fails (no low-confidence top blocker)', () => {
    expect(isConfirmedFail({ status: 'FAIL', confidence: 'low' })).toBe(false);
  });

  it('rejects passing checks', () => {
    expect(isConfirmedFail({ status: 'PASS', confidence: 'high' })).toBe(false);
    expect(isConfirmedFail({ passed: true })).toBe(false);
  });
});
