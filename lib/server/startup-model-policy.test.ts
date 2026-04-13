import { describe, expect, it } from 'vitest';
import {
  resolveStartupAuditOrchestrationModelPolicies,
  resolveStartupServiceModelPolicy,
} from './startup-model-policy';

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

  it('resolves distinct orchestration role policies from service-level keys', async () => {
    const serviceIdsByKey: Record<string, string> = {
      startup_audit_orchestrator: 'svc-planner',
      startup_audit_repo_review: 'svc-repo',
      startup_audit_db_review: 'svc-db',
      startup_audit_risk_review: 'svc-risk',
      startup_audit_execution: 'svc-exec',
      startup_audit_pr_summary: 'svc-summary',
    };

    const supabase = {
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
                data: { default_bundle_id: 'bundle-dev', billing_mode: 'paid' },
                error: null,
              });
            }
            if (table === 'service_bundles') {
              if (filters['id'] === 'bundle-dev' || filters['bundle_key'] === 'startup_dev') {
                return Promise.resolve({
                  data: { id: 'bundle-dev', bundle_key: 'startup_dev' },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            }
            if (table === 'service_catalog') {
              const serviceKey = String(filters['service_key'] ?? '');
              return Promise.resolve({
                data: serviceIdsByKey[serviceKey] ? { id: serviceIdsByKey[serviceKey] } : null,
                error: null,
              });
            }
            if (table === 'service_model_policies') {
              const rowByServiceId: Record<string, PolicyRow> = {
                'svc-planner': {
                  service_id: 'svc-planner',
                  scope_type: 'service_default',
                  provider_name: 'anthropic',
                  model_id: 'claude-opus',
                  max_cost_usd: 0.2,
                  fallback_provider_name: 'openai',
                  fallback_model_id: 'gpt-5.4',
                  is_active: true,
                },
                'svc-repo': {
                  service_id: 'svc-repo',
                  scope_type: 'service_default',
                  provider_name: 'openai',
                  model_id: 'gpt-5.4',
                  max_cost_usd: 0.08,
                  fallback_provider_name: 'openai',
                  fallback_model_id: 'gpt-5.4-mini',
                  is_active: true,
                },
                'svc-db': {
                  service_id: 'svc-db',
                  scope_type: 'service_default',
                  provider_name: 'openai',
                  model_id: 'gpt-5.4-mini',
                  max_cost_usd: 0.04,
                  fallback_provider_name: 'gemini',
                  fallback_model_id: 'gemini-2.0-flash-lite',
                  is_active: true,
                },
                'svc-risk': {
                  service_id: 'svc-risk',
                  scope_type: 'service_default',
                  provider_name: 'anthropic',
                  model_id: 'claude-sonnet',
                  max_cost_usd: 0.05,
                  fallback_provider_name: 'openai',
                  fallback_model_id: 'gpt-5.4-mini',
                  is_active: true,
                },
                'svc-exec': {
                  service_id: 'svc-exec',
                  scope_type: 'service_default',
                  provider_name: 'openai',
                  model_id: 'gpt-5.3-codex',
                  max_cost_usd: 0.1,
                  fallback_provider_name: 'openai',
                  fallback_model_id: 'gpt-5.4-mini',
                  is_active: true,
                },
                'svc-summary': {
                  service_id: 'svc-summary',
                  scope_type: 'service_default',
                  provider_name: 'openai',
                  model_id: 'gpt-5.4-mini',
                  max_cost_usd: 0.02,
                  fallback_provider_name: 'gemini',
                  fallback_model_id: 'gemini-2.0-flash-lite',
                  is_active: true,
                },
              };

              return Promise.resolve({
                data: rowByServiceId[String(filters['service_id'] ?? '')] ?? null,
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    } as any;

    const policies = await resolveStartupAuditOrchestrationModelPolicies({
      supabase,
      startupWorkspaceId: 'ws-1',
      fallbackProvider: 'gemini',
      fallbackModel: 'gemini-2.0-flash',
      estimatedCostsUsd: {
        execution: 0.12,
      },
    });

    expect(policies.planner.requestedModel).toBe('claude-opus');
    expect(policies.repoReview.effectiveModel).toBe('gpt-5.4');
    expect(policies.dbReview.effectiveModel).toBe('gpt-5.4-mini');
    expect(policies.execution.fallbackReason).toBe('budget_guardrail');
    expect(policies.execution.effectiveModel).toBe('gpt-5.4-mini');
    expect(policies.prSummary.effectiveModel).toBe('gpt-5.4-mini');
  });
});
