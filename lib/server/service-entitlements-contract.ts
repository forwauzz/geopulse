export const SERVICE_KEYS = [
  'free_scan',
  'deep_audit',
  'geo_tracker',
  'startup_dashboard',
  'agency_dashboard',
  'markdown_audit_export',
  'markdown_plan_generator',
  'skills_library',
  'github_integration',
  'agent_pr_execution',
  'slack_integration',
  'slack_notifications',
  'api_access',
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

export const BUNDLE_KEYS = ['startup_lite', 'startup_dev', 'agency_core', 'agency_pro'] as const;

export type BundleKey = (typeof BUNDLE_KEYS)[number];

export const LEGACY_AGENCY_FLAG_TO_SERVICE_KEY = {
  agency_dashboard_enabled: 'agency_dashboard',
  scan_launch_enabled: 'free_scan',
  deep_audit_enabled: 'deep_audit',
  geo_tracker_enabled: 'geo_tracker',
} as const satisfies Record<string, ServiceKey>;

export type LegacyAgencyFlagKey = keyof typeof LEGACY_AGENCY_FLAG_TO_SERVICE_KEY;

export function isServiceKey(value: string): value is ServiceKey {
  return (SERVICE_KEYS as readonly string[]).includes(value);
}

export function isBundleKey(value: string): value is BundleKey {
  return (BUNDLE_KEYS as readonly string[]).includes(value);
}
