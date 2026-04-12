import { describe, expect, it } from 'vitest';
import {
  parseStartupAuditFilterFromSearchParams,
  parseStartupDashboardTab,
} from './startup-tab-types';

describe('startup tab parsing', () => {
  it('defaults to overview and all audits', () => {
    expect(parseStartupDashboardTab(undefined)).toBe('overview');
    expect(parseStartupAuditFilterFromSearchParams({})).toEqual({
      preset: 'all',
      from: null,
      to: null,
      status: 'all',
    });
  });

  it('keeps status filters with range filters', () => {
    expect(
      parseStartupAuditFilterFromSearchParams({
        range: '30d',
        status: 'implemented',
      })
    ).toEqual({
      preset: '30d',
      from: null,
      to: null,
      status: 'implemented',
    });
  });

  it('treats custom dates as higher priority than preset while preserving status', () => {
    expect(
      parseStartupAuditFilterFromSearchParams({
        range: '7d',
        from: '2026-04-01',
        to: '2026-04-12',
        status: 'open',
      })
    ).toEqual({
      preset: null,
      from: '2026-04-01',
      to: '2026-04-12',
      status: 'open',
    });
  });
});
