type SupabaseLike = {
  from(table: string): any;
};

type OptionalEnvFlags = {
  STARTUP_DASHBOARD_ENABLED?: string;
  STARTUP_GITHUB_AGENT_ENABLED?: string;
  STARTUP_AUTO_PR_ENABLED?: string;
};

export type StartupRolloutFlags = {
  readonly startupDashboard: boolean;
  readonly githubAgent: boolean;
  readonly autoPr: boolean;
};

const DEFAULT_FLAGS: StartupRolloutFlags = {
  startupDashboard: true,
  githubAgent: true,
  autoPr: false,
};

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return null;
}

function readMetadataFlags(metadata: Record<string, unknown> | null | undefined): Partial<StartupRolloutFlags> {
  const root = metadata ?? {};
  const rollout = (root['rollout_flags'] as Record<string, unknown> | undefined) ?? {};
  const startupDashboard = parseBoolean(rollout['startup_dashboard']);
  const githubAgent = parseBoolean(rollout['github_agent']);
  const autoPr = parseBoolean(rollout['auto_pr']);
  return {
    startupDashboard: startupDashboard ?? undefined,
    githubAgent: githubAgent ?? undefined,
    autoPr: autoPr ?? undefined,
  };
}

function applyEnvOverrides(
  flags: StartupRolloutFlags,
  env: OptionalEnvFlags | null | undefined
): StartupRolloutFlags {
  if (!env) return flags;
  const startupDashboard = parseBoolean(env.STARTUP_DASHBOARD_ENABLED);
  const githubAgent = parseBoolean(env.STARTUP_GITHUB_AGENT_ENABLED);
  const autoPr = parseBoolean(env.STARTUP_AUTO_PR_ENABLED);
  return {
    startupDashboard: startupDashboard ?? flags.startupDashboard,
    githubAgent: githubAgent ?? flags.githubAgent,
    autoPr: autoPr ?? flags.autoPr,
  };
}

export function resolveStartupRolloutFlagsFromMetadata(args: {
  readonly metadata?: Record<string, unknown> | null;
  readonly env?: OptionalEnvFlags | null;
}): StartupRolloutFlags {
  const metadataFlags = readMetadataFlags(args.metadata);
  const base: StartupRolloutFlags = {
    startupDashboard: metadataFlags.startupDashboard ?? DEFAULT_FLAGS.startupDashboard,
    githubAgent: metadataFlags.githubAgent ?? DEFAULT_FLAGS.githubAgent,
    autoPr: metadataFlags.autoPr ?? DEFAULT_FLAGS.autoPr,
  };
  return applyEnvOverrides(base, args.env);
}

export async function resolveStartupWorkspaceRolloutFlags(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly env?: OptionalEnvFlags | null;
}): Promise<StartupRolloutFlags> {
  const { data, error } = await args.supabase
    .from('startup_workspaces')
    .select('metadata')
    .eq('id', args.startupWorkspaceId)
    .maybeSingle();
  if (error) throw error;
  return resolveStartupRolloutFlagsFromMetadata({
    metadata: (data?.metadata as Record<string, unknown> | null | undefined) ?? null,
    env: args.env ?? null,
  });
}
