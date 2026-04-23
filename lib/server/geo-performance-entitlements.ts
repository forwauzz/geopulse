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
const BUNDLE_GPM_CAPS: Partial<Record<string, GeoPerformanceCaps>> = {
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
