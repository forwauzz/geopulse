import { describe, expect, it } from 'vitest';
import { hasCompletedOnboarding, shouldRecoverOnboarding } from './onboarding-recovery';

describe('onboarding recovery', () => {
  it('recognizes the persisted onboarding marker', () => {
    expect(
      hasCompletedOnboarding({
        gp_onboarding_v1: {
          role: 'business',
          completed_at: '2026-07-24T00:00:00.000Z',
        },
      }),
    ).toBe(true);
    expect(hasCompletedOnboarding({})).toBe(false);
  });

  it('recovers only an unactivated account that missed onboarding', () => {
    expect(
      shouldRecoverOnboarding({
        metadata: {},
        hasAgencyWorkspace: false,
        hasStartupWorkspace: false,
        hasCompletedScan: false,
      }),
    ).toBe(true);
  });

  it.each([
    ['agency workspace', true, false, false],
    ['startup workspace', false, true, false],
    ['completed scan', false, false, true],
  ])('does not interrupt an established account with a %s', (_label, agency, startup, scan) => {
    expect(
      shouldRecoverOnboarding({
        metadata: {},
        hasAgencyWorkspace: agency,
        hasStartupWorkspace: startup,
        hasCompletedScan: scan,
      }),
    ).toBe(false);
  });
});
