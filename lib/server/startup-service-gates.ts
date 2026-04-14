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
  /** When set (e.g. after a single shared resolve), skips duplicate workspace/bundle lookups. */
  readonly bundleKey?: BundleKey;
}): Promise<StartupServiceGate> {
  const bundleKey =
    args.bundleKey ??
    (await resolveStartupWorkspaceBundleKey({
      memberSupabase: args.memberSupabase,
      serviceSupabase: args.serviceSupabase,
      startupWorkspaceId: args.startupWorkspaceId,
    }));

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
  readonly slackIntegration: StartupServiceGate;
  readonly slackNotifications: StartupServiceGate;
}> {
  const bundleKey = await resolveStartupWorkspaceBundleKey({
    memberSupabase: args.memberSupabase,
    serviceSupabase: args.serviceSupabase,
    startupWorkspaceId: args.startupWorkspaceId,
  });

  const [githubIntegration, agentPrExecution, slackIntegration, slackNotifications] =
    await Promise.all([
      resolveStartupServiceGate({
        memberSupabase: args.memberSupabase,
        serviceSupabase: args.serviceSupabase,
        startupWorkspaceId: args.startupWorkspaceId,
        userId: args.userId,
        serviceKey: 'github_integration',
        bundleKey,
      }),
      resolveStartupServiceGate({
        memberSupabase: args.memberSupabase,
        serviceSupabase: args.serviceSupabase,
        startupWorkspaceId: args.startupWorkspaceId,
        userId: args.userId,
        serviceKey: 'agent_pr_execution',
        bundleKey,
      }),
      resolveStartupServiceGate({
        memberSupabase: args.memberSupabase,
        serviceSupabase: args.serviceSupabase,
        startupWorkspaceId: args.startupWorkspaceId,
        userId: args.userId,
        serviceKey: 'slack_integration',
        bundleKey,
      }),
      resolveStartupServiceGate({
        memberSupabase: args.memberSupabase,
        serviceSupabase: args.serviceSupabase,
        startupWorkspaceId: args.startupWorkspaceId,
        userId: args.userId,
        serviceKey: 'slack_notifications',
        bundleKey,
      }),
    ]);

  return {
    githubIntegration,
    agentPrExecution,
    slackIntegration,
    slackNotifications,
  };
}

/**
 * Slack OAuth + destination setup paths only need `slack_integration` entitlement.
 * Resolves bundle once (fewer Worker subrequests than full dashboard gates).
 */
export async function resolveStartupSlackIntegrationGate(args: {
  readonly memberSupabase: SupabaseLike;
  readonly serviceSupabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly userId: string;
}): Promise<StartupServiceGate> {
  const bundleKey = await resolveStartupWorkspaceBundleKey({
    memberSupabase: args.memberSupabase,
    serviceSupabase: args.serviceSupabase,
    startupWorkspaceId: args.startupWorkspaceId,
  });
  return resolveStartupServiceGate({
    memberSupabase: args.memberSupabase,
    serviceSupabase: args.serviceSupabase,
    startupWorkspaceId: args.startupWorkspaceId,
    userId: args.userId,
    serviceKey: 'slack_integration',
    bundleKey,
  });
}

/**
 * Push-to-Slack flows need both Slack services. Resolves bundle once + two gates in parallel
 * (not four dashboard gates).
 */
export async function resolveStartupSlackConnectorUiGates(args: {
  readonly memberSupabase: SupabaseLike;
  readonly serviceSupabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly userId: string;
}): Promise<{
  readonly slackIntegration: StartupServiceGate;
  readonly slackNotifications: StartupServiceGate;
}> {
  const bundleKey = await resolveStartupWorkspaceBundleKey({
    memberSupabase: args.memberSupabase,
    serviceSupabase: args.serviceSupabase,
    startupWorkspaceId: args.startupWorkspaceId,
  });
  const [slackIntegration, slackNotifications] = await Promise.all([
    resolveStartupServiceGate({
      memberSupabase: args.memberSupabase,
      serviceSupabase: args.serviceSupabase,
      startupWorkspaceId: args.startupWorkspaceId,
      userId: args.userId,
      serviceKey: 'slack_integration',
      bundleKey,
    }),
    resolveStartupServiceGate({
      memberSupabase: args.memberSupabase,
      serviceSupabase: args.serviceSupabase,
      startupWorkspaceId: args.startupWorkspaceId,
      userId: args.userId,
      serviceKey: 'slack_notifications',
      bundleKey,
    }),
  ]);
  return { slackIntegration, slackNotifications };
}
