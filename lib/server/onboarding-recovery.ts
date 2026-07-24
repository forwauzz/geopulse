export function hasCompletedOnboarding(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const onboarding = (metadata as Record<string, unknown>)['gp_onboarding_v1'];
  if (!onboarding || typeof onboarding !== 'object') return false;
  return typeof (onboarding as Record<string, unknown>)['completed_at'] === 'string';
}

export function shouldRecoverOnboarding(args: {
  readonly metadata: unknown;
  readonly hasAgencyWorkspace: boolean;
  readonly hasStartupWorkspace: boolean;
  readonly hasCompletedScan: boolean;
}): boolean {
  if (hasCompletedOnboarding(args.metadata)) return false;
  return !args.hasAgencyWorkspace && !args.hasStartupWorkspace && !args.hasCompletedScan;
}
