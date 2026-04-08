/**
 * Postgres `plan_type` (`001_initial_schema.sql`) — coarse tier on `public.users.plan`.
 * Bundle granularity belongs on `user_subscriptions.bundle_key` (ADR-009).
 */
export const PLAN_TYPE_VALUES = ['free', 'pro', 'agency'] as const;
export type PlanType = (typeof PLAN_TYPE_VALUES)[number];

export function isValidPlanType(value: string): value is PlanType {
  return (PLAN_TYPE_VALUES as readonly string[]).includes(value);
}

/** Use for admin UI when `users.plan` populates a plan dropdown (unknown legacy value → free). */
export function normalizePlanTypeForAdmin(value: string | null | undefined): PlanType {
  const v = value?.trim();
  if (v && isValidPlanType(v)) return v;
  return 'free';
}
