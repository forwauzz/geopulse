export type OnboardingRole = 'business' | 'agency';
export type OnboardingGoal = 'visibility' | 'competitors' | 'reports';

export type OnboardingProfile = {
  readonly role: OnboardingRole;
  readonly goal: OnboardingGoal;
  readonly website: string | null;
  readonly completedAt: string | null;
};

function isRole(value: unknown): value is OnboardingRole {
  return value === 'business' || value === 'agency';
}

function isGoal(value: unknown): value is OnboardingGoal {
  return value === 'visibility' || value === 'competitors' || value === 'reports';
}

export function readOnboardingProfile(metadata: unknown): OnboardingProfile | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>)['gp_onboarding_v1'];
  if (!raw || typeof raw !== 'object') return null;
  const profile = raw as Record<string, unknown>;
  if (!isRole(profile['role']) || !isGoal(profile['goal'])) return null;
  return {
    role: profile['role'],
    goal: profile['goal'],
    website: typeof profile['website'] === 'string' ? profile['website'] : null,
    completedAt:
      typeof profile['completed_at'] === 'string' ? profile['completed_at'] : null,
  };
}

export function resolveOnboardingGoal(
  metadata: unknown,
  fallbackRole: OnboardingRole,
): OnboardingGoal {
  return readOnboardingProfile(metadata)?.goal ?? (fallbackRole === 'agency' ? 'reports' : 'visibility');
}
