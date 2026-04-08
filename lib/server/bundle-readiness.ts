export type BundleReadinessBundleRow = {
  readonly bundle_key: string;
  readonly name: string;
  readonly workspace_type: string;
  readonly status: string;
  readonly billing_mode: string | null;
  readonly stripe_price_id: string | null;
  readonly monthly_price_cents: number | null;
  readonly trial_period_days: number | null;
};

export type BundleReadinessServiceRow = {
  readonly id: string;
  readonly service_key: string;
  readonly name: string;
};

export type BundleReadinessBundleServiceRow = {
  readonly service_id: string;
  readonly enabled: boolean;
  readonly access_mode: string | null;
  readonly usage_limit: number | null;
};

export type BundleReadinessBillingMappingRow = {
  readonly service_id: string;
  readonly is_active: boolean;
  readonly stripe_product_id: string | null;
  readonly stripe_price_id: string | null;
  readonly billing_mode: string;
};

export type BundleReadinessEntitlementOverrideRow = {
  readonly service_id: string;
  readonly scope_type: 'global' | 'bundle_default';
  readonly enabled: boolean;
  readonly access_mode: string | null;
};

export type BundleReadinessIssue = {
  readonly area: 'billing' | 'mappings' | 'entitlements';
  readonly severity: 'warning' | 'critical';
  readonly message: string;
};

export type BundleReadinessSummary = {
  readonly status: 'ready' | 'review' | 'needs_setup';
  readonly bundleKey: string;
  readonly billing: {
    readonly ready: boolean;
    readonly label: string;
    readonly issues: string[];
  };
  readonly mappings: {
    readonly ready: boolean;
    readonly enabledServices: number;
    readonly mappedServices: number;
    readonly issues: string[];
  };
  readonly entitlements: {
    readonly ready: boolean;
    readonly bundleOverrides: number;
    readonly globalOverrides: number;
    readonly issues: string[];
  };
  readonly issues: BundleReadinessIssue[];
};

function readModeLabel(mode: string | null): string {
  return mode ?? 'unset';
}

function makeIssue(
  area: BundleReadinessIssue['area'],
  severity: BundleReadinessIssue['severity'],
  message: string
): BundleReadinessIssue {
  return { area, severity, message };
}

export function buildBundleReadinessSummary(args: {
  bundle: BundleReadinessBundleRow;
  services: BundleReadinessServiceRow[];
  bundleServices: BundleReadinessBundleServiceRow[];
  billingMappings: BundleReadinessBillingMappingRow[];
  overrides: BundleReadinessEntitlementOverrideRow[];
}): BundleReadinessSummary {
  const issues: BundleReadinessIssue[] = [];
  const billingIssues: string[] = [];
  const mappingIssues: string[] = [];
  const entitlementIssues: string[] = [];

  const billingMode = readModeLabel(args.bundle.billing_mode);
  const isPaidBundle = billingMode === 'monthly' || billingMode === 'annual';

  if (!args.bundle.billing_mode) {
    billingIssues.push('Billing mode is not set.');
  }
  if (isPaidBundle && !args.bundle.stripe_price_id?.trim()) {
    billingIssues.push('Paid bundles need a Stripe price id.');
  }
  if (isPaidBundle && (!args.bundle.monthly_price_cents || args.bundle.monthly_price_cents <= 0)) {
    billingIssues.push('Paid bundles need a monthly price in cents.');
  }
  if (isPaidBundle && (args.bundle.trial_period_days ?? 0) < 0) {
    billingIssues.push('Trial period cannot be negative.');
  }

  const enabledBundleServices = args.bundleServices.filter((row) => row.enabled);
  const serviceById = new Map(args.services.map((service) => [service.id, service]));
  const activeMappings = new Map(
    args.billingMappings
      .filter((row) => row.is_active && !!row.stripe_price_id?.trim())
      .map((row) => [row.service_id, row])
  );

  if (enabledBundleServices.length === 0) {
    mappingIssues.push('No enabled services are mapped to this bundle.');
  } else {
    const missingMappings = enabledBundleServices.filter((row) => {
      const accessMode = row.access_mode ?? 'paid';
      if (accessMode === 'free' || accessMode === 'off') return false;
      return !activeMappings.has(row.service_id);
    });
    if (missingMappings.length > 0) {
      const names = missingMappings
        .map((row) => serviceById.get(row.service_id)?.service_key ?? row.service_id)
        .join(', ');
      mappingIssues.push(`Missing active Stripe mapping for: ${names}.`);
    }
  }

  const bundleOverrides = args.overrides.filter((row) => row.scope_type === 'bundle_default');
  const globalOverrides = args.overrides.filter((row) => row.scope_type === 'global');
  if (bundleOverrides.length === 0 && globalOverrides.length === 0) {
    entitlementIssues.push('No bundle_default or global entitlement overrides exist yet.');
  }

  const billingReady = billingIssues.length === 0;
  const mappingsReady = mappingIssues.length === 0;
  const entitlementsReady = entitlementIssues.length === 0;

  const status: BundleReadinessSummary['status'] = !billingReady || !mappingsReady
    ? 'needs_setup'
    : !entitlementsReady
      ? 'review'
      : 'ready';

  if (!billingReady) {
    issues.push(
      ...billingIssues.map((message) => makeIssue('billing', 'critical', message))
    );
  }
  if (!mappingsReady) {
    issues.push(
      ...mappingIssues.map((message) => makeIssue('mappings', 'critical', message))
    );
  }
  if (!entitlementsReady) {
    issues.push(
      ...entitlementIssues.map((message) => makeIssue('entitlements', 'warning', message))
    );
  }

  return {
    status,
    bundleKey: args.bundle.bundle_key,
    billing: {
      ready: billingReady,
      label: billingMode,
      issues: billingIssues,
    },
    mappings: {
      ready: mappingsReady,
      enabledServices: enabledBundleServices.length,
      mappedServices: activeMappings.size,
      issues: mappingIssues,
    },
    entitlements: {
      ready: entitlementsReady,
      bundleOverrides: bundleOverrides.length,
      globalOverrides: globalOverrides.length,
      issues: entitlementIssues,
    },
    issues,
  };
}
