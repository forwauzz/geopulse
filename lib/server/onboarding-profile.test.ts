import { describe, expect, it } from 'vitest';
import { readOnboardingProfile, resolveOnboardingGoal } from './onboarding-profile';

describe('onboarding profile', () => {
  it('reads the saved customer intent', () => {
    expect(readOnboardingProfile({
      gp_onboarding_v1: {
        role: 'agency',
        goal: 'competitors',
        website: 'https://example.com',
        completed_at: '2026-07-28T10:00:00.000Z',
      },
    })).toEqual({
      role: 'agency',
      goal: 'competitors',
      website: 'https://example.com',
      completedAt: '2026-07-28T10:00:00.000Z',
    });
  });

  it('uses persona-aware defaults for older accounts', () => {
    expect(resolveOnboardingGoal({}, 'business')).toBe('visibility');
    expect(resolveOnboardingGoal({}, 'agency')).toBe('reports');
  });
});
