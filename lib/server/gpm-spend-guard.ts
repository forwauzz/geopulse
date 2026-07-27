import type { GpmPlatform } from './geo-performance-schedule';

export const DEFAULT_GPM_MONTHLY_SPEND_CAP_USD = 5;
export const DEFAULT_GPM_CLIENT_ACTIVATION_CAP_USD = 0.2;

const COST_PER_QUERY_USD: Readonly<Record<GpmPlatform, number>> = {
  chatgpt: 0.001,
  gemini: 0.001,
  // Conservative request + token allowance for Sonar. This intentionally rounds up.
  perplexity: 0.007,
};

export type GpmSpendPolicy = {
  readonly monthlyCapUsd: number;
  readonly clientActivationCapUsd: number;
};

function positiveMoney(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 10000) / 10000 : fallback;
}

export function resolveGpmSpendPolicy(env: {
  readonly GPM_MONTHLY_SPEND_CAP_USD?: string;
  readonly GPM_CLIENT_ACTIVATION_CAP_USD?: string;
}): GpmSpendPolicy {
  return {
    monthlyCapUsd: positiveMoney(
      env.GPM_MONTHLY_SPEND_CAP_USD,
      DEFAULT_GPM_MONTHLY_SPEND_CAP_USD,
    ),
    clientActivationCapUsd: positiveMoney(
      env.GPM_CLIENT_ACTIVATION_CAP_USD,
      DEFAULT_GPM_CLIENT_ACTIVATION_CAP_USD,
    ),
  };
}

export function estimateGpmPlatformCostUsd(
  platform: GpmPlatform,
  promptCount: number,
): number {
  return Math.round(COST_PER_QUERY_USD[platform] * Math.max(0, promptCount) * 10000) / 10000;
}

export function estimateGpmActivationCostUsd(
  platforms: readonly GpmPlatform[],
  promptCount: number,
  includeCompetitorResearch = true,
): number {
  const measurement = platforms.reduce(
    (sum, platform) => sum + estimateGpmPlatformCostUsd(platform, promptCount),
    0,
  );
  // One grounded competitor lookup plus the two bounded LLM-assisted readiness checks.
  const onboardingResearchAndAuditAllowance = includeCompetitorResearch ? 0.02 : 0;
  return Math.round((measurement + onboardingResearchAndAuditAllowance) * 10000) / 10000;
}

export function isGpmSpendAllowed(input: {
  readonly estimatedUsd: number;
  readonly monthSpendUsd: number;
  readonly clientSpendUsd?: number;
  readonly policy: GpmSpendPolicy;
}): { readonly allowed: boolean; readonly reason: string | null } {
  if ((input.clientSpendUsd ?? 0) + input.estimatedUsd > input.policy.clientActivationCapUsd) {
    return { allowed: false, reason: 'client_activation_cap' };
  }
  if (input.monthSpendUsd + input.estimatedUsd > input.policy.monthlyCapUsd) {
    return { allowed: false, reason: 'monthly_portfolio_cap' };
  }
  return { allowed: true, reason: null };
}

export async function loadGpmMonthSpendUsd(
  supabase: { from(table: string): any },
  now = new Date(),
): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data } = await supabase
    .from('benchmark_run_groups')
    .select('metadata,created_at')
    .eq('run_scope', 'gpm_client_run')
    .gte('created_at', monthStart)
    .limit(5000);
  return Math.round(
    ((data ?? []) as Array<{ metadata?: Record<string, unknown> | null }>).reduce((sum, row) => {
      const value = Number(row.metadata?.['estimated_cost_usd'] ?? 0);
      return sum + (Number.isFinite(value) && value > 0 ? value : 0);
    }, 0) * 10000,
  ) / 10000;
}
