import { describe, expect, it } from 'vitest';
import {
  countQualifiedWorkspaceActivations,
  chooseRevenueAgencyFocus,
  resolveRevenueAgencyConfig,
} from './revenue-agency-agent';

describe('Revenue Agency control plane', () => {
  it('is fail-closed and clamps its daily run hour', () => {
    expect(resolveRevenueAgencyConfig({ mode: 'autonomous' }, false, false).mode).toBe('off');
    expect(resolveRevenueAgencyConfig({ mode: 'autonomous' }, true, true).mode).toBe('off');
    expect(resolveRevenueAgencyConfig({ mode: 'assist', run_hour_utc: 99 }, true, false)).toMatchObject({
      mode: 'assist',
      runHourUtc: 23,
      nurtureEnabled: false,
    });
    expect(
      resolveRevenueAgencyConfig(
        {
          mode: 'autonomous',
          nurture_enabled: true,
          nurture_daily_cap: 999,
          nurture_delay_hours: 0,
        },
        true,
        false
      )
    ).toMatchObject({
      nurtureEnabled: true,
      nurtureDailyCap: 20,
      nurtureDelayHours: 0,
      prospectingEnabled: false,
    });
  });

  it('preserves city-country prospecting markets instead of splitting every comma', () => {
    expect(resolveRevenueAgencyConfig({
      prospecting_markets: 'Toronto, Canada, Montreal, Canada, New York, USA',
    }, true, false).prospectingMarkets).toEqual([
      'Toronto, Canada',
      'Montreal, Canada',
      'New York, USA',
    ]);
    expect(resolveRevenueAgencyConfig({
      prospecting_markets: 'Toronto, Canada; Vancouver, Canada',
    }, true, false).prospectingMarkets).toEqual([
      'Toronto, Canada',
      'Vancouver, Canada',
    ]);
  });

  it('moves focus through the revenue hand-offs without inventing activity', () => {
    expect(
      chooseRevenueAgencyFocus({
        leads: 0,
        activeProspects: 0,
        completedScans: 0,
        proofAssets: 0,
        paidSubscriptionsStarted: 0,
        activeMonitoring: 0,
      }).focus
    ).toBe('acquire');
    expect(
      chooseRevenueAgencyFocus({
        leads: 4,
        activeProspects: 2,
        completedScans: 3,
        proofAssets: 0,
        paidSubscriptionsStarted: 0,
        activeMonitoring: 0,
      }).focus
    ).toBe('prove');
    expect(
      chooseRevenueAgencyFocus({
        leads: 4,
        activeProspects: 2,
        completedScans: 3,
        proofAssets: 2,
        paidSubscriptionsStarted: 1,
        activeMonitoring: 0,
      }).focus
    ).toBe('retain');
    expect(
      chooseRevenueAgencyFocus({
        leads: 4,
        activeProspects: 2,
        completedScans: 3,
        proofAssets: 2,
        paidSubscriptionsStarted: 0,
        activeMonitoring: 0,
      }).focus
    ).toBe('convert');
  });

  it('counts only deduplicated external workspaces with evidenced first value', () => {
    expect(countQualifiedWorkspaceActivations({
      owners: [
        { id: 'startup-1', kind: 'startup', canonical_domain: 'customer.ca', fallback_domain: null, status: 'active', metadata: {} },
        { id: 'startup-duplicate', kind: 'startup', canonical_domain: 'www.customer.ca', fallback_domain: null, status: 'pilot', metadata: {} },
        { id: 'startup-free-no-value', kind: 'startup', canonical_domain: 'free.ca', fallback_domain: null, status: 'active', metadata: {} },
        { id: 'startup-test', kind: 'startup', canonical_domain: 'example.com', fallback_domain: null, status: 'active', metadata: {} },
        { id: 'startup-internal', kind: 'startup', canonical_domain: 'alie.app', fallback_domain: null, status: 'active', metadata: {} },
        { id: 'agency-excluded', kind: 'agency', canonical_domain: 'lifter.ca', fallback_domain: null, status: 'active', metadata: {} },
        { id: 'agency-external', kind: 'agency', canonical_domain: 'agency.ca', fallback_domain: null, status: 'active', metadata: {} },
      ],
      scans: [
        { startup_workspace_id: 'startup-1', agency_account_id: null, domain: 'https://customer.ca/', url: null, run_source: 'startup_dashboard' },
        { startup_workspace_id: 'startup-duplicate', agency_account_id: null, domain: 'customer.ca', url: null, run_source: 'monitor' },
        { startup_workspace_id: 'startup-test', agency_account_id: null, domain: 'example.com', url: null, run_source: 'startup_dashboard' },
        { startup_workspace_id: 'startup-internal', agency_account_id: null, domain: 'alie.app', url: null, run_source: 'startup_dashboard' },
        { startup_workspace_id: null, agency_account_id: 'agency-excluded', domain: 'client.ca', url: null, run_source: 'agency_dashboard' },
        { startup_workspace_id: null, agency_account_id: 'agency-external', domain: 'agency-client.ca', url: null, run_source: 'agency_dashboard' },
      ],
    })).toBe(2);
  });

  it('fails closed on mismatched startup domains, invalid sources, and inactive owners', () => {
    expect(countQualifiedWorkspaceActivations({
      owners: [
        { id: 'mismatch', kind: 'startup', canonical_domain: 'right.ca', fallback_domain: null, status: 'active', metadata: {} },
        { id: 'paused', kind: 'startup', canonical_domain: 'paused.ca', fallback_domain: null, status: 'paused', metadata: {} },
        { id: 'flagged', kind: 'agency', canonical_domain: 'flagged.ca', fallback_domain: null, status: 'active', metadata: { is_test: true } },
      ],
      scans: [
        { startup_workspace_id: 'mismatch', agency_account_id: null, domain: 'wrong.ca', url: null, run_source: 'startup_dashboard' },
        { startup_workspace_id: 'paused', agency_account_id: null, domain: 'paused.ca', url: null, run_source: 'startup_dashboard' },
        { startup_workspace_id: null, agency_account_id: 'flagged', domain: 'client.ca', url: null, run_source: 'agency_dashboard' },
        { startup_workspace_id: 'mismatch', agency_account_id: null, domain: 'right.ca', url: null, run_source: 'public_self_serve' },
      ],
    })).toBe(0);
  });
});
