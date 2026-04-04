import { describe, expect, it } from 'vitest';
import { resolveStartupServiceModelPolicy } from './startup-model-policy';

type PolicyRow = {
  service_id: string;
  scope_type: 'service_default' | 'bundle' | 'startup_workspace';
  bundle_id?: string;
  startup_workspace_id?: string;
  provider_name: string;
  model_id: string;
  max_cost_usd: number | null;
  fallback_provider_name: string | null;
  fallback_model_id: string | null;
  is_active: boolean;
};

function createMockSupabase(args: {
  readonly billingMode?: 'free' | 'paid' | 'trial';
  readonly defaultBundleId?: string | null;
  readonly bundles: Array<{ id: string; bundle_key: string }>;
  readonly serviceId: string;
  readonly policies: PolicyRow[];
}) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      return {
        select() {
          return this;
        },
        eq(field: string, value: unknown) {
          filters[field] = value;
          return this;
        },
        maybeSingle() {
          if (table === 'startup_workspaces') {
            return Promise.resolve({
              data: {
                default_bundle_id: args.defaultBundleId ?? null,
                billing_mode: args.billingMode ?? 'free',
              },
              error: null,
            });
          }
          if (table === 'service_bundles') {
            if (filters['id']) {
              const row = args.bundles.find((item) => item.id === filters['id']) ?? null;
              return Promise.resolve({ data: row, error: null });
            }
            if (filters['bundle_key']) {
              const row = args.bundles.find((item) => item.bundle_key === filters['bundle_key']) ?? null;
              return Promise.resolve({ data: row, error: null });
            }
          }
          if (table === 'service_catalog') {
            return Promise.resolve({ data: { id: args.serviceId }, error: null });
          }
          if (table === 'service_model_policies') {
            const row =
              args.policies.find((item) => {
                if (item.service_id !== filters['service_id']) return false;
                if (item.scope_type !== filters['scope_type']) return false;
                if (filters['is_active'] != null && item.is_active !== filters['is_active']) return false;
                if (item.scope_type === 'bundle') return item.bundle_id === filters['bundle_id'];
                if (item.scope_type === 'startup_workspace')
                  return item.startup_workspace_id === filters['startup_workspace_id'];
                return true;
              }) ?? null;
            return Promise.resolve({ data: row, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  } as any;
}

describe('startup model policy resolver', () => {
  it('applies precedence: service default -> bundle -> startup workspace', async () => {
    const supabase = createMockSupabase({
      defaultBundleId: 'bundle-dev',
      bundles: [
        { id: 'bundle-lite', bundle_key: 'startup_lite' },
        { id: 'bundle-dev', bundle_key: 'startup_dev' },
      ],
      serviceId: 'svc-plan',
      policies: [
        {
          service_id: 'svc-plan',
          scope_type: 'service_default',
          provider_name: 'gemini',
          model_id: 'gemini-2.0-flash',
          max_cost_usd: 0.05,
          fallback_provider_name: 'gemini',
          fallback_model_id: 'gemini-2.0-flash-lite',
          is_active: true,
        },
        {
          service_id: 'svc-plan',
          scope_type: 'bundle',
          bundle_id: 'bundle-dev',
          provider_name: 'openai',
          model_id: 'gpt-5.4-mini',
          max_cost_usd: 0.08,
          fallback_provider_name: 'gemini',
          fallback_model_id: 'gemini-2.0-flash-lite',
          is_active: true,
        },
        {
          service_id: 'svc-plan',
          scope_type: 'startup_workspace',
          startup_workspace_id: 'ws-1',
          provider_name: 'anthropic',
          model_id: 'claude-sonnet',
          max_cost_usd: 0.1,
          fallback_provider_name: 'gemini',
          fallback_model_id: 'gemini-2.0-flash-lite',
          is_active: true,
        },
      ],
    });

    const policy = await resolveStartupServiceModelPolicy({
      supabase,
      startupWorkspaceId: 'ws-1',
      serviceKey: 'markdown_plan_generator',
      fallbackProvider: 'gemini',
      fallbackModel: 'gemini-2.0-flash',
    });

    expect(policy.source).toBe('startup_workspace');
    expect(policy.requestedProvider).toBe('anthropic');
    expect(policy.effectiveModel).toBe('claude-sonnet');
  });

  it('falls back to alternate model when budget guardrail is exceeded', async () => {
    const supabase = createMockSupabase({
      bundles: [{ id: 'bundle-lite', bundle_key: 'startup_lite' }],
      serviceId: 'svc-pr',
      policies: [
        {
          service_id: 'svc-pr',
          scope_type: 'service_default',
          provider_name: 'openai',
          model_id: 'gpt-5.4',
          max_cost_usd: 0.02,
          fallback_provider_name: 'openai',
          fallback_model_id: 'gpt-5.4-mini',
          is_active: true,
        },
      ],
    });

    const policy = await resolveStartupServiceModelPolicy({
      supabase,
      startupWorkspaceId: 'ws-1',
      serviceKey: 'agent_pr_execution',
      fallbackProvider: 'gemini',
      fallbackModel: 'gemini-2.0-flash',
      estimatedCostUsd: 0.05,
    });

    expect(policy.budgetExceeded).toBe(true);
    expect(policy.fallbackReason).toBe('budget_guardrail');
    expect(policy.effectiveModel).toBe('gpt-5.4-mini');
  });

  it('falls back when provider is unsupported', async () => {
    const supabase = createMockSupabase({
      bundles: [{ id: 'bundle-lite', bundle_key: 'startup_lite' }],
      serviceId: 'svc-pr',
      policies: [
        {
          service_id: 'svc-pr',
          scope_type: 'service_default',
          provider_name: 'custom',
          model_id: 'private-model',
          max_cost_usd: null,
          fallback_provider_name: 'gemini',
          fallback_model_id: 'gemini-2.0-flash-lite',
          is_active: true,
        },
      ],
    });

    const policy = await resolveStartupServiceModelPolicy({
      supabase,
      startupWorkspaceId: 'ws-1',
      serviceKey: 'agent_pr_execution',
      fallbackProvider: 'gemini',
      fallbackModel: 'gemini-2.0-flash',
      supportedProviders: ['gemini', 'openai'],
    });

    expect(policy.fallbackReason).toBe('unsupported_provider');
    expect(policy.effectiveProvider).toBe('gemini');
    expect(policy.effectiveModel).toBe('gemini-2.0-flash-lite');
  });
});
