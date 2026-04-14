import type { StartupAgentPrRun } from '@/lib/server/startup-agent-pr-workflow';
import type { StartupActionItem, StartupTrendPoint } from '@/lib/server/startup-dashboard-shell';
import type { StartupDashboardData, StartupWorkspaceSummary } from '@/lib/server/startup-dashboard-data';
import type { StartupGithubIntegrationState } from '@/lib/server/startup-github-integration';
import type {
  StartupImplementationLaneCard,
  StartupImplementationPlanRecord,
} from '@/lib/server/startup-implementation-plan';
import type { StartupRolloutFlags } from '@/lib/server/startup-rollout-flags';
import type { StartupServiceGate } from '@/lib/server/startup-service-gates';
import type {
  StartupSlackDeliveryEvent,
  StartupSlackDestination,
  StartupSlackIntegrationState,
} from '@/lib/server/startup-slack-integration';
import type { StartupTrackingMetrics } from '@/lib/server/startup-tracking-metrics';

/** URL tab values for `/dashboard/startup?tab=` */
export type StartupDashboardTabId = 'overview' | 'audits' | 'delivery' | 'settings';

export const STARTUP_DASHBOARD_TABS: readonly StartupDashboardTabId[] = [
  'overview',
  'audits',
  'delivery',
  'settings',
] as const;

export function parseStartupDashboardTab(raw: string | undefined | null): StartupDashboardTabId {
  if (raw === 'audits' || raw === 'delivery' || raw === 'settings') return raw;
  return 'overview';
}

/** Parsed audit filter state (TR-006 URL: `range`, `from`, `to`) */
export type StartupAuditRangePreset = '7d' | '30d' | '90d' | 'all';
export type StartupAuditStatusFilter = 'all' | 'implemented' | 'open';

export type StartupAuditFilterState = {
  readonly preset: StartupAuditRangePreset | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly status: StartupAuditStatusFilter;
};

/** Reads `range` / `from` / `to` from startup dashboard search params. Custom dates win over preset. */
export function parseStartupAuditFilterFromSearchParams(sp: {
  readonly range?: string;
  readonly from?: string;
  readonly to?: string;
  readonly status?: string;
}): StartupAuditFilterState {
  const from = sp.from?.trim() || null;
  const to = sp.to?.trim() || null;
  const status =
    sp.status === 'implemented' || sp.status === 'open' ? sp.status : 'all';
  if (from || to) {
    return { preset: null, from, to, status };
  }
  const r = sp.range?.trim();
  if (r === '7d' || r === '30d' || r === '90d') {
    return { preset: r, from: null, to: null, status };
  }
  if (r === 'all') {
    return { preset: 'all', from: null, to: null, status };
  }
  return { preset: 'all', from: null, to: null, status };
}

/** Service entitlement gates resolved for the startup dashboard UI */
export type StartupDashboardUiGates = {
  readonly githubIntegration: StartupServiceGate;
  readonly agentPrExecution: StartupServiceGate;
  readonly slackIntegration: StartupServiceGate;
  readonly slackNotifications: StartupServiceGate;
};

/** Search params the startup dashboard page may read (TR-008: status params infer `tab` via redirect) */
export type StartupDashboardPageSearchParams = {
  readonly startupWorkspace?: string;
  readonly tab?: string;
  readonly github?: string;
  readonly pr?: string;
  readonly slack?: string;
  readonly slack_detail?: string;
  readonly range?: string;
  readonly from?: string;
  readonly to?: string;
  readonly status?: string;
};

/**
 * Data and derived values computed in `page.tsx` and passed into tab components.
 * Keeps prop contracts stable while the page is refactored into a thin orchestrator.
 */
export type StartupDashboardTabContext = {
  readonly dashboard: StartupDashboardData;
  readonly selectedWorkspace: StartupWorkspaceSummary | null;
  readonly startupServiceGates: StartupDashboardUiGates | null;
  readonly startupRolloutFlags: StartupRolloutFlags | null;
  readonly trend: StartupTrendPoint[];
  readonly backlog: StartupActionItem[];
  readonly metrics: StartupTrackingMetrics;
  readonly latestPlan: StartupImplementationPlanRecord | null;
  readonly laneCards: StartupImplementationLaneCard[];
  readonly prRuns: StartupAgentPrRun[];
  readonly approvedRecommendations: StartupDashboardData['recommendations'];
  readonly deliveredReports: number;
  readonly openRecommendations: number;
  readonly averageScore: number | null;
  readonly githubState: StartupGithubIntegrationState;
  readonly githubAllowlistValue: string;
  readonly slackState: StartupSlackIntegrationState;
  readonly slackDestinations: StartupSlackDestination[];
  readonly slackDeliveryEvents: StartupSlackDeliveryEvent[];
  readonly slackActiveDestinations: StartupSlackDestination[];
  readonly slackActiveInstallations: StartupSlackIntegrationState['installations'];
  readonly canManageSlackAutoPost: boolean;
  readonly githubStatusMessage: string | null;
  readonly prStatusMessage: string | null;
  readonly slackStatusMessage: string | null;
};

export type StartupTabBarProps = {
  readonly activeTab: StartupDashboardTabId;
  readonly startupWorkspaceId: string | null;
};

export type StartupOverviewTabProps = StartupDashboardTabContext;

export type StartupOverviewStatStripProps = Pick<
  StartupDashboardTabContext,
  'dashboard' | 'averageScore' | 'openRecommendations'
>;

export type StartupAuditsTabProps = StartupDashboardTabContext & {
  readonly auditFilter: StartupAuditFilterState;
};

/** Serializable row for audits table + compare mode (passed to client component). */
export type StartupAuditRowModel = {
  readonly scanId: string;
  readonly createdAt: string;
  readonly domain: string;
  readonly url: string;
  readonly score: number | null;
  readonly letterGrade: string | null;
  readonly runSource: string;
  readonly reportStatus: string;
  readonly pdfUrl: string | null;
  readonly recCount: number;
  readonly implementedCount: number;
  readonly openCount: number;
  readonly recTitles: readonly string[];
  readonly implementedTitles: readonly string[];
  readonly executionId: string | null;
  readonly executionStatus: StartupDashboardData['executions'][number]['status'] | null;
  readonly executionSummary: string | null;
  readonly executionUpdatedAt: string | null;
  readonly executionSourceKind: StartupDashboardData['executions'][number]['sourceKind'] | null;
};

export type StartupDeliveryTabProps = StartupDashboardTabContext;

export type StartupSettingsTabProps = StartupDashboardTabContext;
