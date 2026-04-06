import { describe, expect, it } from 'vitest';
import {
  buildStartupDashboardUrl,
  inferStartupDashboardTabFromStatusParams,
  isStartupSlackDeliveryStatusCode,
} from './startup-dashboard-status-messages';

describe('inferStartupDashboardTabFromStatusParams', () => {
  it('routes PR status to overview', () => {
    expect(inferStartupDashboardTabFromStatusParams({ pr: 'pr_queued' })).toBe('overview');
  });

  it('routes GitHub status to settings', () => {
    expect(inferStartupDashboardTabFromStatusParams({ github: 'github_connected' })).toBe('settings');
  });

  it('prioritizes PR over GitHub when both present', () => {
    expect(
      inferStartupDashboardTabFromStatusParams({ pr: 'pr_failed', github: 'github_connected' })
    ).toBe('overview');
  });

  it('routes Slack send outcomes to delivery', () => {
    expect(inferStartupDashboardTabFromStatusParams({ slack: 'slack_send_ok' })).toBe('delivery');
  });

  it('routes Slack connect flow to settings', () => {
    expect(inferStartupDashboardTabFromStatusParams({ slack: 'slack_connected' })).toBe('settings');
  });

  it('returns null when no recognized status', () => {
    expect(inferStartupDashboardTabFromStatusParams({ github: 'unknown' })).toBeNull();
  });
});

describe('buildStartupDashboardUrl', () => {
  it('omits tab when overview', () => {
    expect(buildStartupDashboardUrl({ tab: 'overview' })).toBe('/dashboard/startup');
  });

  it('preserves status params and tab', () => {
    expect(
      buildStartupDashboardUrl({
        startupWorkspace: 'ws1',
        tab: 'settings',
        github: 'github_connected',
      })
    ).toBe('/dashboard/startup?startupWorkspace=ws1&tab=settings&github=github_connected');
  });
});

describe('isStartupSlackDeliveryStatusCode', () => {
  it('identifies delivery-scoped Slack codes', () => {
    expect(isStartupSlackDeliveryStatusCode('slack_send_ok')).toBe(true);
    expect(isStartupSlackDeliveryStatusCode('slack_connected')).toBe(false);
  });
});
