/**
 * URL status query params (`github`, `pr`, `slack`) for `/dashboard/startup` redirects and banners.
 */

export function readGithubStatusMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'github_connected':
      return 'GitHub installation connected for this workspace.';
    case 'github_disconnected':
      return 'GitHub integration disconnected.';
    case 'github_repos_saved':
      return 'Repository allowlist saved.';
    case 'github_invalid_repos':
      return 'One or more repository slugs were invalid. Use owner/repo format.';
    case 'github_not_entitled':
      return 'GitHub integration is disabled for this workspace bundle.';
    case 'github_rollout_disabled':
      return 'GitHub integration is disabled by startup rollout flags for this workspace.';
    case 'github_billing_blocked':
      return 'GitHub integration is currently paid-only for this workspace. Ask an admin to enable billing or switch service mode.';
    case 'github_install_url_missing':
      return 'GitHub install URL is not configured yet.';
    case 'github_callback_invalid':
    case 'github_state_invalid':
      return 'GitHub callback could not be validated. Retry connect.';
    case 'github_env_missing':
      return 'Server env is missing GitHub integration credentials.';
    default:
      return null;
  }
}

export function readPrStatusMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'pr_queued':
      return 'PR execution run queued from approved recommendation.';
    case 'pr_opened':
      return 'PR run marked as opened and recommendation moved to shipped.';
    case 'pr_merged':
      return 'PR run marked merged and recommendation moved to validated.';
    case 'pr_failed':
      return 'PR run marked failed and recommendation moved to failed.';
    case 'pr_not_entitled':
      return 'PR workflow is disabled for this workspace bundle.';
    case 'pr_rollout_disabled':
      return 'PR workflow is disabled by startup rollout flags for this workspace.';
    case 'pr_suggest_only':
      return 'Auto-PR is in suggest-only mode for this workspace. Recommendation approval is still available.';
    case 'pr_billing_blocked':
      return 'PR workflow is currently paid-only for this workspace. Ask an admin to enable billing or switch service mode.';
    case 'pr_env_missing':
      return 'Server env is missing required integration keys for PR workflow.';
    default:
      return null;
  }
}

export function readSlackStatusMessage(code: string | undefined, detail?: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'slack_connected':
      return 'Slack workspace connected.';
    case 'slack_disconnected':
      return 'Slack workspace disconnected.';
    case 'slack_not_entitled':
      return 'Slack integration is disabled for this workspace bundle.';
    case 'slack_rollout_disabled':
      return 'Slack integration is disabled by startup rollout flags for this workspace.';
    case 'slack_billing_blocked':
      return 'Slack integration is currently paid-only for this workspace. Ask an admin to enable billing or switch service mode.';
    case 'slack_install_url_missing':
      return 'Slack install URL is not configured yet.';
    case 'slack_client_id_missing':
      return 'Slack client ID is not configured in runtime secrets.';
    case 'slack_callback_invalid': {
      const base = 'Slack callback could not be validated. Retry connect.';
      if (!detail) return base;
      const hints: Record<string, string> = {
        missing_oauth_code:
          'Slack did not return an authorization code. Start again from Connect Slack and finish with Allow.',
        missing_client_id: 'Server is missing Slack client ID.',
        missing_client_secret: 'Server is missing Slack client secret.',
        bad_redirect_uri:
          'Slack rejected the token exchange: redirect URL must exactly match https://getgeopulse.com/api/startup/slack/callback in the Slack app Redirect URLs.',
        invalid_client:
          'Slack rejected client credentials. Use App Credentials → Client Secret (not Signing Secret), matching this Slack app.',
        invalid_code:
          'Authorization code was invalid or expired. Click Connect Slack once and complete Allow without refreshing.',
        code_already_used: 'That authorization code was already used. Click Connect Slack again.',
        missing_team_after_exchange:
          'Slack approved the install but no workspace id was returned. If this is an Enterprise Grid app, contact support.',
        slack_http_not_ok: 'Slack token HTTP request failed. Retry or check Slack status.',
        slack_json_parse_failed: 'Slack returned an unexpected response during token exchange.',
        slack_ok_false: 'Slack token exchange failed without a specific error code.',
      };
      const hint = hints[detail] ?? `Detail: ${detail}.`;
      return `${base} ${hint}`;
    }
    case 'slack_state_invalid':
      return 'Slack callback state is invalid or expired. Retry connect.';
    case 'slack_env_missing':
      return 'Server env is missing Slack integration credentials.';
    case 'slack_oauth_denied':
      return 'Slack authorization was cancelled.';
    case 'slack_destination_saved':
      return 'Slack destination saved.';
    case 'slack_destination_invalid':
      return 'Slack destination requires workspace, install, and channel values.';
    case 'slack_send_ok':
      return 'Report sent to Slack.';
    case 'slack_send_failed':
      return 'Slack send failed. Reconnect Slack or verify destination channel access.';
    case 'slack_send_invalid':
      return 'Slack send requires workspace, report, and destination.';
    case 'slack_destination_missing':
      return 'Selected Slack destination was not found.';
    case 'slack_report_missing':
      return 'Selected report was not found for this workspace.';
    case 'slack_auto_post_updated':
      return 'Slack auto-post setting updated.';
    default:
      return null;
  }
}

const SLACK_STATUS_DELIVERY_TAB_CODES = new Set<string>([
  'slack_send_ok',
  'slack_send_failed',
  'slack_send_invalid',
  'slack_destination_missing',
  'slack_report_missing',
]);

export function isStartupSlackDeliveryStatusCode(code: string | undefined): boolean {
  const c = code?.trim();
  if (!c) return false;
  return SLACK_STATUS_DELIVERY_TAB_CODES.has(c);
}

export type StartupDashboardTabIdForRouting = 'overview' | 'audits' | 'delivery' | 'settings';

/**
 * When a status param is present and maps to a known message, prefer this tab so the user sees the banner.
 * Priority: PR (overview) → GitHub (settings) → Slack (delivery vs settings).
 */
export function inferStartupDashboardTabFromStatusParams(sp: {
  readonly github?: string;
  readonly pr?: string;
  readonly slack?: string;
  readonly slack_detail?: string;
}): StartupDashboardTabIdForRouting | null {
  if (readPrStatusMessage(sp.pr)) return 'overview';
  if (readGithubStatusMessage(sp.github)) return 'settings';
  const slack = sp.slack?.trim();
  if (slack) {
    if (SLACK_STATUS_DELIVERY_TAB_CODES.has(slack)) return 'delivery';
    if (readSlackStatusMessage(slack, sp.slack_detail)) return 'settings';
  }
  return null;
}

export function buildStartupDashboardUrl(sp: {
  readonly startupWorkspace?: string;
  readonly tab?: StartupDashboardTabIdForRouting;
  readonly range?: string;
  readonly from?: string;
  readonly to?: string;
  readonly status?: string;
  readonly github?: string;
  readonly pr?: string;
  readonly slack?: string;
  readonly slack_detail?: string;
}): string {
  const p = new URLSearchParams();
  if (sp.startupWorkspace) p.set('startupWorkspace', sp.startupWorkspace);
  if (sp.tab && sp.tab !== 'overview') p.set('tab', sp.tab);
  if (sp.range?.trim()) p.set('range', sp.range.trim());
  if (sp.from?.trim()) p.set('from', sp.from.trim());
  if (sp.to?.trim()) p.set('to', sp.to.trim());
  if (sp.status?.trim()) p.set('status', sp.status.trim());
  if (sp.github?.trim()) p.set('github', sp.github.trim());
  if (sp.pr?.trim()) p.set('pr', sp.pr.trim());
  if (sp.slack?.trim()) p.set('slack', sp.slack.trim());
  if (sp.slack_detail?.trim()) p.set('slack_detail', sp.slack_detail.trim());
  const query = p.toString();
  return query.length > 0 ? `/dashboard/startup?${query}` : '/dashboard/startup';
}
