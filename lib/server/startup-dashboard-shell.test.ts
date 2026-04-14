import { describe, expect, it } from 'vitest';
import { buildStartupActionBacklog, buildStartupTrendSeries } from './startup-dashboard-shell';
import type { StartupDashboardData } from './startup-dashboard-data';

function createDashboardData(overrides: Partial<StartupDashboardData> = {}): StartupDashboardData {
  return {
    workspaces: [],
    selectedWorkspaceId: null,
    scans: [],
    reports: [],
    recommendations: [],
    executions: [],
    ...overrides,
  };
}

describe('startup-dashboard-shell helpers', () => {
  it('builds trend series from scored scans in chronological order', () => {
    const series = buildStartupTrendSeries(
      [
        {
          id: 'scan-3',
          startupWorkspaceId: 'ws-1',
          url: 'https://c.com',
          domain: 'c.com',
          score: 90,
          letterGrade: 'A',
          createdAt: '2026-04-03T00:00:00.000Z',
          runSource: 'startup_dashboard',
        },
        {
          id: 'scan-2',
          startupWorkspaceId: 'ws-1',
          url: 'https://b.com',
          domain: 'b.com',
          score: 70,
          letterGrade: 'C',
          createdAt: '2026-04-02T00:00:00.000Z',
          runSource: 'startup_dashboard',
        },
        {
          id: 'scan-1',
          startupWorkspaceId: 'ws-1',
          url: 'https://a.com',
          domain: 'a.com',
          score: 50,
          letterGrade: 'D',
          createdAt: '2026-04-01T00:00:00.000Z',
          runSource: 'startup_dashboard',
        },
      ],
      8
    );

    expect(series.map((point) => point.score)).toEqual([50, 70, 90]);
  });

  it('derives actionable backlog items from scans and reports', () => {
    const data = createDashboardData({
      scans: [
        {
          id: 'scan-1',
          startupWorkspaceId: 'ws-1',
          url: 'https://acme.com',
          domain: 'acme.com',
          score: 62,
          letterGrade: 'D',
          createdAt: '2026-04-04T00:00:00.000Z',
          runSource: 'startup_dashboard',
        },
      ],
      reports: [],
    });

    const backlog = buildStartupActionBacklog(data);
    expect(backlog.some((item) => item.title.includes('Run deep audit'))).toBe(true);
    expect(backlog.some((item) => item.title.includes('Address low score'))).toBe(true);
  });

  it('returns no-blockers item when scans are covered and healthy', () => {
    const data = createDashboardData({
      scans: [
        {
          id: 'scan-1',
          startupWorkspaceId: 'ws-1',
          url: 'https://acme.com',
          domain: 'acme.com',
          score: 88,
          letterGrade: 'B+',
          createdAt: '2026-04-04T00:00:00.000Z',
          runSource: 'startup_dashboard',
        },
      ],
      reports: [
        {
          id: 'report-1',
          scanId: 'scan-1',
          startupWorkspaceId: 'ws-1',
          type: 'deep_audit',
          emailDeliveredAt: null,
          pdfGeneratedAt: null,
          pdfUrl: null,
          createdAt: '2026-04-04T00:30:00.000Z',
        },
      ],
    });

    const backlog = buildStartupActionBacklog(data);
    expect(backlog[0]?.key).toBe('no-blockers');
  });
});
