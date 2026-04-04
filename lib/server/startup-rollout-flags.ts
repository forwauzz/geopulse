type SupabaseLike = {
  from(table: string): any;
};

type OptionalEnvFlags = {
  STARTUP_DASHBOARD_ENABLED?: string;
  STARTUP_GITHUB_AGENT_ENABLED?: string;
  STARTUP_AUTO_PR_ENABLED?: string;
  STARTUP_SLACK_AGENT_ENABLED?: string;
  STARTUP_SLACK_AUTO_POST_ENABLED?: string;
};

export type StartupRolloutFlags = {
  readonly startupDashboard: boolean;
  readonly githubAgent: boolean;
  readonly autoPr: boolean;
  readonly slackAgent: boolean;
  readonly slackAutoPost: boolean;
};

export type StartupRolloutFlagPatch = Partial<StartupRolloutFlags>;

const DEFAULT_FLAGS: StartupRolloutFlags = {
  startupDashboard: true,
  githubAgent: true,
  autoPr: false,
  slackAgent: false,
  slackAutoPost: false,
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
  const slackAgent = parseBoolean(rollout['slack_agent']);
  const slackAutoPost = parseBoolean(rollout['slack_auto_post']);
  return {
    startupDashboard: startupDashboard ?? undefined,
    githubAgent: githubAgent ?? undefined,
    autoPr: autoPr ?? undefined,
    slackAgent: slackAgent ?? undefined,
    slackAutoPost: slackAutoPost ?? undefined,
  };
}

function toMetadataRolloutFlags(flags: StartupRolloutFlags): Record<string, boolean> {
  return {
    startup_dashboard: flags.startupDashboard,
    github_agent: flags.githubAgent,
    auto_pr: flags.autoPr,
    slack_agent: flags.slackAgent,
    slack_auto_post: flags.slackAutoPost,
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
  const slackAgent = parseBoolean(env.STARTUP_SLACK_AGENT_ENABLED);
  const slackAutoPost = parseBoolean(env.STARTUP_SLACK_AUTO_POST_ENABLED);
  return {
    startupDashboard: startupDashboard ?? flags.startupDashboard,
    githubAgent: githubAgent ?? flags.githubAgent,
    autoPr: autoPr ?? flags.autoPr,
    slackAgent: slackAgent ?? flags.slackAgent,
    slackAutoPost: slackAutoPost ?? flags.slackAutoPost,
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
    slackAgent: metadataFlags.slackAgent ?? DEFAULT_FLAGS.slackAgent,
    slackAutoPost: metadataFlags.slackAutoPost ?? DEFAULT_FLAGS.slackAutoPost,
  };
  return applyEnvOverrides(base, args.env);
}

export function applyStartupRolloutFlagPatch(args: {
  readonly metadata?: Record<string, unknown> | null;
  readonly patch: StartupRolloutFlagPatch;
}): Record<string, unknown> {
  const current = resolveStartupRolloutFlagsFromMetadata({
    metadata: args.metadata ?? null,
    env: null,
  });
  const next: StartupRolloutFlags = {
    startupDashboard: args.patch.startupDashboard ?? current.startupDashboard,
    githubAgent: args.patch.githubAgent ?? current.githubAgent,
    autoPr: args.patch.autoPr ?? current.autoPr,
    slackAgent: args.patch.slackAgent ?? current.slackAgent,
    slackAutoPost: args.patch.slackAutoPost ?? current.slackAutoPost,
  };
  return {
    ...(args.metadata ?? {}),
    rollout_flags: toMetadataRolloutFlags(next),
  };
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
