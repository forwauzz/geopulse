import { describe, expect, it } from 'vitest';
import {
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
    });
  });

  it('moves focus through the revenue hand-offs without inventing activity', () => {
    expect(
      chooseRevenueAgencyFocus({
        leads: 0,
        activeProspects: 0,
        completedScans: 0,
        proofAssets: 0,
        convertedLeads: 0,
        activeMonitoring: 0,
      }).focus
    ).toBe('acquire');
    expect(
      chooseRevenueAgencyFocus({
        leads: 4,
        activeProspects: 2,
        completedScans: 3,
        proofAssets: 0,
        convertedLeads: 0,
        activeMonitoring: 0,
      }).focus
    ).toBe('prove');
    expect(
      chooseRevenueAgencyFocus({
        leads: 4,
        activeProspects: 2,
        completedScans: 3,
        proofAssets: 2,
        convertedLeads: 1,
        activeMonitoring: 0,
      }).focus
    ).toBe('retain');
  });
});
