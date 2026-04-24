import type { BundleKey } from './service-entitlements-contract';
import { resolveServiceEntitlement } from './service-entitlements';

type SupabaseLike = { from(table: string): any };

export type GeoPerformanceTier = 'startup_dev' | 'agency_core' | 'agency_pro';
export type GeoPerformanceCadence = 'monthly' | 'biweekly' | 'weekly';
export type GeoPerformanceDeliverySurface = 'email' | 'slack' | 'portal';
export type GeoPerformancePlatform = 'chatgpt' | 'gemini' | 'perplexity';

export type ResolvedGeoPerformanceEntitlement = {
  readonly enabled: boolean;
  readonly tier: GeoPerformanceTier | null;
  readonly maxPromptsPerRun: number | null;
  readonly allowedCadences: readonly GeoPerformanceCadence[];
  readonly deliverySurfaces: readonly GeoPerformanceDeliverySurface[];
  readonly platformsAllowed: readonly GeoPerformancePlatform[];
  readonly source: string;
};

export type GeoPerformanceCaps = {
  readonly tier: GeoPerformanceTier;
  readonly maxPromptsPerRun: number | null;
  readonly allowedCadences: readonly GeoPerformanceCadence[];
  readonly deliverySurfaces: readonly GeoPerformanceDeliverySurface[];
};

// Per playbook: startup_lite has no access; startup_dev, agency_core, agency_pro all get
// all 3 platforms. Caps differ by prompt count, cadence frequency, and delivery surface.
export const BUNDLE_GPM_CAPS: Partial<Record<string, GeoPerformanceCaps>> = {
  startup_dev: {
    tier: 'startup_dev',
    maxPromptsPerRun: 10,
    allowedCadences: ['monthly'],
    deliverySurfaces: ['email'],
  },
  agency_core: {
    tier: 'agency_core',
    maxPromptsPerRun: 15,
    allowedCadences: ['monthly', 'biweekly'],
    deliverySurfaces: ['email', 'slack'],
  },
  agency_pro: {
    tier: 'agency_pro',
    maxPromptsPerRun: null,
    allowedCadences: ['monthly', 'biweekly', 'weekly'],
    deliverySurfaces: ['email', 'slack', 'portal'],
  },
};

const ALL_PLATFORMS: readonly GeoPerformancePlatform[] = ['chatgpt', 'gemini', 'perplexity'];

const DISABLED_ENTITLEMENT: ResolvedGeoPerformanceEntitlement = {
  enabled: false,
  tier: null,
  maxPromptsPerRun: null,
  allowedCadences: [],
  deliverySurfaces: [],
  platformsAllowed: [],
  source: 'service_default',
};

export function resolveGeoPerformanceCaps(bundleKey: string | null): GeoPerformanceCaps | null {
  if (!bundleKey) return null;
  return BUNDLE_GPM_CAPS[bundleKey] ?? null;
}

export type GpmBundleCapOverrideInput = {
  readonly maxPromptsPerRun: number | null;
  readonly allowedCadences: readonly GeoPerformanceCadence[];
  readonly deliverySurfaces: readonly GeoPerformanceDeliverySurface[];
};

export function mergeGpmBundleCaps(
  bundleKey: string | null,
  dbOverride?: GpmBundleCapOverrideInput | null
): GeoPerformanceCaps | null {
  if (!bundleKey) return null;
  const hardcoded = BUNDLE_GPM_CAPS[bundleKey] ?? null;
  if (!hardcoded) return null;
  if (!dbOverride) return hardcoded;

  const allowedCadences =
    dbOverride.allowedCadences.length > 0
      ? dbOverride.allowedCadences
      : hardcoded.allowedCadences;
  const deliverySurfaces =
    dbOverride.deliverySurfaces.length > 0
      ? dbOverride.deliverySurfaces
      : hardcoded.deliverySurfaces;

  return {
    tier: hardcoded.tier,
    maxPromptsPerRun: dbOverride.maxPromptsPerRun !== undefined
      ? dbOverride.maxPromptsPerRun
      : hardcoded.maxPromptsPerRun,
    allowedCadences,
    deliverySurfaces,
  };
}

export async function resolveGeoPerformanceEntitlement(args: {
  readonly supabase: SupabaseLike;
  readonly bundleKey: BundleKey | null;
  readonly agencyAccountId?: string | null;
  readonly agencyClientId?: string | null;
  readonly userId?: string | null;
}): Promise<ResolvedGeoPerformanceEntitlement> {
  const base = await resolveServiceEntitlement({
    supabase: args.supabase,
    serviceKey: 'geo_performance_monitoring',
    bundleKey: args.bundleKey ?? null,
    agencyAccountId: args.agencyAccountId ?? null,
    agencyClientId: args.agencyClientId ?? null,
    userId: args.userId ?? null,
  });

  if (!base.enabled) {
    return { ...DISABLED_ENTITLEMENT, source: base.source };
  }

  const caps = resolveGeoPerformanceCaps(args.bundleKey);

  if (!caps) {
    // Service is enabled but no known caps for this bundle — treat as disabled.
    // This covers startup_lite if the service were ever accidentally toggled on there.
    return { ...DISABLED_ENTITLEMENT, source: base.source };
  }

  return {
    enabled: true,
    tier: caps.tier,
    maxPromptsPerRun: caps.maxPromptsPerRun,
    allowedCadences: caps.allowedCadences,
    deliverySurfaces: caps.deliverySurfaces,
    platformsAllowed: ALL_PLATFORMS,
    source: base.source,
  };
}

// ── Sweep entitlements helper ─────────────────────────────────────────────────

type GpmConfigStub = {
  readonly id: string;
  readonly startup_workspace_id: string | null;
  readonly agency_account_id: string | null;
};

/**
 * Resolves entitlements for a batch of client benchmark configs in two DB queries
 * (one for startup workspaces, one for agency accounts). Used by the scheduled
 * GPM sweep worker so it doesn't need to resolve entitlements one-by-one.
 * Pass `bundleCapOverrides` (keyed by bundle_key) to apply DB-stored cap overrides
 * in preference to hardcoded constants.
 */
export async function buildGpmEntitlementsMap(
  supabase: SupabaseLike,
  configs: readonly GpmConfigStub[],
  bundleCapOverrides?: Readonly<Record<string, GpmBundleCapOverrideInput>>
): Promise<ReadonlyMap<string, ResolvedGeoPerformanceEntitlement>> {
  const startupIds = [
    ...new Set(configs.filter((c) => c.startup_workspace_id).map((c) => c.startup_workspace_id!)),
  ];
  const agencyIds = [
    ...new Set(configs.filter((c) => c.agency_account_id).map((c) => c.agency_account_id!)),
  ];

  // bundle_key keyed by workspace/account ID — most recent active subscription wins
  const bundleByStartup = new Map<string, string>();
  const bundleByAgency = new Map<string, string>();

  if (startupIds.length > 0) {
    const { data } = await (supabase as any)
      .from('user_subscriptions')
      .select('bundle_key, startup_workspace_id')
      .in('startup_workspace_id', startupIds)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false });
    for (const row of (data ?? []) as { bundle_key: string; startup_workspace_id: string }[]) {
      if (!bundleByStartup.has(row.startup_workspace_id)) {
        bundleByStartup.set(row.startup_workspace_id, row.bundle_key);
      }
    }
  }

  if (agencyIds.length > 0) {
    const { data } = await (supabase as any)
      .from('user_subscriptions')
      .select('bundle_key, agency_account_id')
      .in('agency_account_id', agencyIds)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false });
    for (const row of (data ?? []) as { bundle_key: string; agency_account_id: string }[]) {
      if (!bundleByAgency.has(row.agency_account_id)) {
        bundleByAgency.set(row.agency_account_id, row.bundle_key);
      }
    }
  }

  const result = new Map<string, ResolvedGeoPerformanceEntitlement>();

  for (const config of configs) {
    const bundleKey = config.startup_workspace_id
      ? (bundleByStartup.get(config.startup_workspace_id) ?? null)
      : config.agency_account_id
        ? (bundleByAgency.get(config.agency_account_id) ?? null)
        : null;

    const dbOverride = bundleKey ? (bundleCapOverrides?.[bundleKey] ?? null) : null;
    const caps = mergeGpmBundleCaps(bundleKey, dbOverride);

    if (!caps) {
      result.set(config.id, { ...DISABLED_ENTITLEMENT, source: 'no_active_subscription' });
      continue;
    }

    result.set(config.id, {
      enabled: true,
      tier: caps.tier,
      maxPromptsPerRun: caps.maxPromptsPerRun,
      allowedCadences: caps.allowedCadences,
      deliverySurfaces: caps.deliverySurfaces,
      platformsAllowed: ALL_PLATFORMS,
      source: dbOverride ? 'subscription_bundle_db_override' : 'subscription_bundle',
    });
  }

  return result;
}

// ── Validation ────────────────────────────────────────────────────────────────

export type GeoPerformanceValidationResult = {
  readonly valid: boolean;
  readonly errors: readonly string[];
};

const VALID_CADENCES = new Set<string>(['monthly', 'biweekly', 'weekly']);
const VALID_PLATFORMS = new Set<string>(['chatgpt', 'gemini', 'perplexity']);

export function validateClientBenchmarkConfigInput(input: {
  readonly topic?: string | null;
  readonly location?: string | null;
  readonly cadence?: string | null;
  readonly platformsEnabled?: readonly string[] | null;
  readonly benchmarkDomainId?: string | null;
  readonly startupWorkspaceId?: string | null;
  readonly agencyAccountId?: string | null;
  readonly competitorList?: readonly string[] | null;
}): GeoPerformanceValidationResult {
  const errors: string[] = [];

  if (!input.topic?.trim()) errors.push('topic is required.');
  if (!input.location?.trim()) errors.push('location is required.');
  if (!input.benchmarkDomainId?.trim()) errors.push('benchmarkDomainId is required.');

  const hasStartup = !!input.startupWorkspaceId?.trim();
  const hasAgency = !!input.agencyAccountId?.trim();
  if (!hasStartup && !hasAgency) {
    errors.push('Either startupWorkspaceId or agencyAccountId is required.');
  }
  if (hasStartup && hasAgency) {
    errors.push('Only one of startupWorkspaceId or agencyAccountId may be set.');
  }

  if (!input.cadence || !VALID_CADENCES.has(input.cadence)) {
    errors.push(`cadence must be one of: ${[...VALID_CADENCES].join(', ')}.`);
  }

  const platforms = input.platformsEnabled ?? [];
  if (platforms.length === 0) {
    errors.push('At least one platform must be enabled.');
  } else {
    const invalid = platforms.filter((p) => !VALID_PLATFORMS.has(p));
    if (invalid.length > 0) {
      errors.push(`Unknown platform(s): ${invalid.join(', ')}.`);
    }
  }

  if (input.competitorList !== undefined && input.competitorList !== null) {
    if (input.competitorList.length > 50) {
      errors.push('Competitor list may not exceed 50 entries.');
    }
    const blanks = input.competitorList.filter((c) => !c.trim());
    if (blanks.length > 0) {
      errors.push('Competitor list entries must not be blank.');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Enforcement ───────────────────────────────────────────────────────────────

export type GeoPerformanceEnforcementResult = {
  readonly allowed: boolean;
  readonly violations: readonly string[];
};

export function enforceGeoPerformanceLimits(
  entitlement: ResolvedGeoPerformanceEntitlement,
  config: {
    readonly cadence: string;
    readonly platformsEnabled: readonly string[];
    readonly promptCount: number;
  }
): GeoPerformanceEnforcementResult {
  if (!entitlement.enabled) {
    return {
      allowed: false,
      violations: ['GEO Performance Monitoring is not enabled for this workspace.'],
    };
  }

  const violations: string[] = [];

  if (!(entitlement.allowedCadences as readonly string[]).includes(config.cadence)) {
    violations.push(
      `Cadence "${config.cadence}" is not allowed on this plan. Allowed: ${entitlement.allowedCadences.join(', ')}.`
    );
  }

  const disallowedPlatforms = config.platformsEnabled.filter(
    (p) => !(entitlement.platformsAllowed as readonly string[]).includes(p)
  );
  if (disallowedPlatforms.length > 0) {
    violations.push(`Platform(s) not allowed on this plan: ${disallowedPlatforms.join(', ')}.`);
  }

  if (entitlement.maxPromptsPerRun !== null && config.promptCount > entitlement.maxPromptsPerRun) {
    violations.push(
      `Prompt count ${config.promptCount} exceeds plan limit of ${entitlement.maxPromptsPerRun}.`
    );
  }

  return { allowed: violations.length === 0, violations };
}
