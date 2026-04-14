import { describe, expect, it, vi } from 'vitest';
import { buildStartupTrackingMetrics } from './startup-tracking-metrics';
import type { StartupDashboardData } from './startup-dashboard-data';

function createData(overrides: Partial<StartupDashboardData> = {}): StartupDashboardData {
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

describe('buildStartupTrackingMetrics', () => {
  it('builds burn-down and funnel counts', () => {
    const data = createData({
      scans: [
        {
          id: 'scan-1',
          startupWorkspaceId: 'ws-1',
          url: 'https://a.com',
          domain: 'a.com',
          score: 70,
          letterGrade: 'C',
          createdAt: '2026-04-01T00:00:00.000Z',
          runSource: 'startup_dashboard',
        },
        {
          id: 'scan-2',
          startupWorkspaceId: 'ws-1',
          url: 'https://b.com',
          domain: 'b.com',
          score: 80,
          letterGrade: 'B',
          createdAt: '2026-04-02T00:00:00.000Z',
          runSource: 'startup_dashboard',
        },
      ],
      reports: [
        {
          id: 'report-1',
          scanId: 'scan-1',
          startupWorkspaceId: 'ws-1',
          type: 'deep_audit',
          emailDeliveredAt: '2026-04-03T00:00:00.000Z',
          pdfGeneratedAt: '2026-04-02T01:00:00.000Z',
          pdfUrl: 'https://example.com/r.pdf',
          createdAt: '2026-04-03T00:00:00.000Z',
        },
      ],
    });

    const metrics = buildStartupTrackingMetrics(data);
    expect(metrics.funnel.suggested).toBe(2);
    expect(metrics.funnel.approved).toBe(1);
    expect(metrics.funnel.inProgress).toBe(0);
    expect(metrics.funnel.shipped).toBe(0);
    expect(metrics.funnel.validated).toBe(1);
    expect(metrics.funnel.failed).toBe(0);
    expect(metrics.burnDown.length).toBeGreaterThan(0);
  });

  it('computes impact windows from recent scored scans', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T00:00:00.000Z'));
    const data = createData({
      scans: [
        {
          id: 'scan-1',
          startupWorkspaceId: 'ws-1',
          url: 'https://a.com',
          domain: 'a.com',
          score: 60,
          letterGrade: 'D',
          createdAt: '2026-04-09T00:00:00.000Z',
          runSource: 'startup_dashboard',
        },
        {
          id: 'scan-2',
          startupWorkspaceId: 'ws-1',
          url: 'https://b.com',
          domain: 'b.com',
          score: 90,
          letterGrade: 'A',
          createdAt: '2026-03-20T00:00:00.000Z',
          runSource: 'startup_dashboard',
        },
      ],
    });

    const metrics = buildStartupTrackingMetrics(data);
    expect(metrics.impactWindows.d7).toBe(60);
    expect(metrics.impactWindows.d14).toBe(60);
    expect(metrics.impactWindows.d30).toBe(75);
    vi.useRealTimers();
  });

  it('uses recommendation lifecycle statuses for funnel when available', () => {
    const data = createData({
      recommendations: [
        {
          id: 'rec-1',
          startupWorkspaceId: 'ws-1',
          scanId: 'scan-1',
          reportId: null,
          sourceKind: 'markdown_audit',
          sourceRef: 'audit://1',
          title: 'Fix robots',
          summary: null,
          teamLane: 'ops',
          priority: 'high',
          status: 'suggested',
          statusChangedAt: '2026-04-01T00:00:00.000Z',
          statusReason: null,
          statusUpdatedByUserId: null,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'rec-2',
          startupWorkspaceId: 'ws-1',
          scanId: 'scan-1',
          reportId: null,
          sourceKind: 'markdown_audit',
          sourceRef: 'audit://1',
          title: 'Deploy schema',
          summary: null,
          teamLane: 'dev',
          priority: 'medium',
          status: 'approved',
          statusChangedAt: '2026-04-02T00:00:00.000Z',
          statusReason: null,
          statusUpdatedByUserId: null,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'rec-3',
          startupWorkspaceId: 'ws-1',
          scanId: 'scan-1',
          reportId: null,
          sourceKind: 'markdown_audit',
          sourceRef: 'audit://1',
          title: 'Ship content refresh',
          summary: null,
          teamLane: 'content',
          priority: 'medium',
          status: 'shipped',
          statusChangedAt: '2026-04-03T00:00:00.000Z',
          statusReason: null,
          statusUpdatedByUserId: null,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    });

    const metrics = buildStartupTrackingMetrics(data);
    expect(metrics.funnel.suggested).toBe(1);
    expect(metrics.funnel.approved).toBe(1);
    expect(metrics.funnel.inProgress).toBe(0);
    expect(metrics.funnel.shipped).toBe(1);
    expect(metrics.funnel.validated).toBe(0);
    expect(metrics.funnel.failed).toBe(0);
  });

  it('builds benchmark-ready execution outcome summaries', () => {
    const data = createData({
      executions: [
        {
          id: 'exec-1',
          startupWorkspaceId: 'ws-1',
          scanId: 'scan-1',
          reportId: 'report-1',
          sourceKind: 'markdown_audit',
          sourceRef: 'audit://1',
          status: 'plan_ready',
          summary: 'Ready for review.',
          errorMessage: null,
          approvalStatus: 'ready_for_review',
          approvalRequestedAt: '2026-04-01T00:00:00.000Z',
          approvalApprovedAt: null,
          approvalRejectedAt: null,
          approvalRejectionReason: null,
          planId: 'plan-1',
          planTaskCount: 3,
          manualWaitTaskId: null,
          manualWaitReason: null,
          plannerModel: 'claude-opus',
          repoReviewModel: 'gpt-5.4',
          dbReviewModel: 'gpt-5.4-mini',
          riskReviewModel: 'claude-sonnet',
          completedAt: null,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'exec-2',
          startupWorkspaceId: 'ws-1',
          scanId: 'scan-2',
          reportId: 'report-2',
          sourceKind: 'markdown_audit',
          sourceRef: 'audit://2',
          status: 'waiting_manual',
          summary: 'Waiting on migration.',
          errorMessage: null,
          approvalStatus: 'approved_for_execution',
          approvalRequestedAt: '2026-04-02T00:00:00.000Z',
          approvalApprovedAt: '2026-04-02T00:10:00.000Z',
          approvalRejectedAt: null,
          approvalRejectionReason: null,
          planId: 'plan-2',
          planTaskCount: 2,
          manualWaitTaskId: 'task-1',
          manualWaitReason: 'Run migration',
          plannerModel: 'claude-opus',
          repoReviewModel: 'gpt-5.4',
          dbReviewModel: 'gpt-5.4-mini',
          riskReviewModel: 'claude-sonnet',
          completedAt: null,
          createdAt: '2026-04-02T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        },
        {
          id: 'exec-3',
          startupWorkspaceId: 'ws-1',
          scanId: 'scan-3',
          reportId: 'report-3',
          sourceKind: 'markdown_audit',
          sourceRef: 'audit://3',
          status: 'completed',
          summary: 'Completed.',
          errorMessage: null,
          approvalStatus: 'approved_for_execution',
          approvalRequestedAt: '2026-04-03T00:00:00.000Z',
          approvalApprovedAt: '2026-04-03T00:10:00.000Z',
          approvalRejectedAt: null,
          approvalRejectionReason: null,
          planId: 'plan-3',
          planTaskCount: 4,
          manualWaitTaskId: null,
          manualWaitReason: null,
          plannerModel: 'claude-opus',
          repoReviewModel: 'gpt-5.4',
          dbReviewModel: 'gpt-5.4-mini',
          riskReviewModel: 'claude-sonnet',
          completedAt: '2026-04-03T00:20:00.000Z',
          createdAt: '2026-04-03T00:00:00.000Z',
          updatedAt: '2026-04-03T00:20:00.000Z',
        },
        {
          id: 'exec-4',
          startupWorkspaceId: 'ws-1',
          scanId: 'scan-4',
          reportId: 'report-4',
          sourceKind: 'markdown_audit',
          sourceRef: 'audit://4',
          status: 'failed',
          summary: 'Failed.',
          errorMessage: 'PR run failed',
          approvalStatus: 'approved_for_execution',
          approvalRequestedAt: '2026-04-04T00:00:00.000Z',
          approvalApprovedAt: '2026-04-04T00:10:00.000Z',
          approvalRejectedAt: null,
          approvalRejectionReason: null,
          planId: 'plan-4',
          planTaskCount: 1,
          manualWaitTaskId: null,
          manualWaitReason: null,
          plannerModel: 'claude-opus',
          repoReviewModel: 'gpt-5.4',
          dbReviewModel: 'gpt-5.4-mini',
          riskReviewModel: 'claude-sonnet',
          completedAt: '2026-04-04T00:20:00.000Z',
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:20:00.000Z',
        },
      ],
    });

    const metrics = buildStartupTrackingMetrics(data);
    expect(metrics.executionHistory.total).toBe(4);
    expect(metrics.executionHistory.planReady).toBe(1);
    expect(metrics.executionHistory.waitingManual).toBe(1);
    expect(metrics.executionHistory.completed).toBe(1);
    expect(metrics.executionHistory.failed).toBe(1);
    expect(metrics.benchmarkOutcomeSummary).toEqual([
      { label: 'In flight', value: 1 },
      { label: 'Blocked manual', value: 1 },
      { label: 'Completed', value: 1 },
      { label: 'Failed', value: 1 },
      { label: 'Cancelled', value: 0 },
    ]);
  });
});
