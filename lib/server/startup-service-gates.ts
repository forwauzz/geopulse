import type { BundleKey, ServiceKey } from './service-entitlements-contract';
import { resolveServiceBillingGuard, type ResolvedServiceBillingGuard } from './service-billing-guard';
import { resolveServiceEntitlement, type ResolvedServiceEntitlement } from './service-entitlements';
import { resolveStartupWorkspaceBundleKey } from './startup-github-integration';

type SupabaseLike = {
  from(table: string): any;
};

export type StartupServiceGate = {
  readonly serviceKey: ServiceKey;
  readonly bundleKey: BundleKey;
  readonly entitlement: ResolvedServiceEntitlement;
  readonly billing: ResolvedServiceBillingGuard;
  readonly enabled: boolean;
  readonly blockedReason: ResolvedServiceBillingGuard['reason'] | null;
};

export async function resolveStartupServiceGate(args: {
  readonly memberSupabase: SupabaseLike;
  readonly serviceSupabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly userId: string;
  readonly serviceKey: ServiceKey;
}): Promise<StartupServiceGate> {
  const bundleKey = await resolveStartupWorkspaceBundleKey({
    memberSupabase: args.memberSupabase,
    serviceSupabase: args.serviceSupabase,
    startupWorkspaceId: args.startupWorkspaceId,
  });

  const entitlement = await resolveServiceEntitlement({
    supabase: args.serviceSupabase,
    serviceKey: args.serviceKey,
    bundleKey,
    userId: args.userId,
  });

  const billing = await resolveServiceBillingGuard({
    supabase: args.serviceSupabase,
    startupWorkspaceId: args.startupWorkspaceId,
    bundleKey,
    serviceKey: args.serviceKey,
    entitlement,
  });

  return {
    serviceKey: args.serviceKey,
    bundleKey,
    entitlement,
    billing,
    enabled: billing.allowed,
    blockedReason: billing.allowed ? null : billing.reason,
  };
}

export async function resolveStartupDashboardUiGates(args: {
  readonly memberSupabase: SupabaseLike;
  readonly serviceSupabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly userId: string;
}): Promise<{
  readonly githubIntegration: StartupServiceGate;
  readonly agentPrExecution: StartupServiceGate;
}> {
  const [githubIntegration, agentPrExecution] = await Promise.all([
    resolveStartupServiceGate({
      memberSupabase: args.memberSupabase,
      serviceSupabase: args.serviceSupabase,
      startupWorkspaceId: args.startupWorkspaceId,
      userId: args.userId,
      serviceKey: 'github_integration',
    }),
    resolveStartupServiceGate({
      memberSupabase: args.memberSupabase,
      serviceSupabase: args.serviceSupabase,
      startupWorkspaceId: args.startupWorkspaceId,
      userId: args.userId,
      serviceKey: 'agent_pr_execution',
    }),
  ]);

  return {
    githubIntegration,
    agentPrExecution,
  };
}
