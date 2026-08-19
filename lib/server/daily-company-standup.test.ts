import { describe, expect, it } from 'vitest';
import type { AgentStatus } from './agent-console';
import {
  buildDailyCompanyStandup,
  DEPARTMENT_RUBRICS,
  isExcludedRevenueIdentity,
  isVerifiedStripeSubscriptionId,
  renderDailyCompanyStandupHtml,
  type StandupWorkLoop,
} from './daily-company-standup';
import { buildFounderControlRoom } from './founder-control-room';
import type { RevenueAgencySnapshot } from './revenue-agency-agent';

const now = new Date('2026-07-31T12:00:00.000Z');

const snapshot: RevenueAgencySnapshot = {
  windowDays: 30,
  leads: 0,
  activatedLeads: 0,
  markedConvertedLeads: 0,
  convertedLeads: 0,
  activeProspects: 200,
  outreachSends: 195,
  outreachOpens: 78,
  completedScans: 12,
  deliveredReports: 6,
  checkoutStarts: 0,
  repliesReceived: 0,
  meetingsBooked: 0,
  workspaceRecordsCreated: 6,
  qualifiedWorkspaceActivations: 1,
  paymentsCompleted: 2,
  paidSubscriptionsStarted: 0,
  cancellations: 0,
  proofAssets: 4,
  publishedProof: 2,
  activeMonitoring: 0,
  pastDueMonitoring: 0,
  activeAgencyAccounts: 1,
  stages: [],
  focus: 'convert',
  focusReason: 'Qualified prospects exist, but no human reply has reached recurring revenue.',
};

const agent = (key: string): AgentStatus => ({
  key,
  name: key,
  audience: 'internal',
  description: key,
  control: 'flag',
  enabled: true,
  killSwitch: false,
  blockers: [],
});

const room = buildFounderControlRoom({
  agents: [
    agent('revenue_agency'),
    agent('engagement_digest'),
    agent('recurring_audits'),
    agent('seo_owner'),
    agent('research'),
    agent('social_proof'),
    agent('marketing_autopilot'),
    agent('self_improvement'),
  ],
  snapshot,
  logs: [
    {
      event: 'revenue_agency_run',
      level: 'info',
      created_at: '2026-07-31T11:00:00.000Z',
    },
  ],
});

function loop(overrides: Partial<StandupWorkLoop>): StandupWorkLoop {
  return {
    id: crypto.randomUUID(),
    source_type: 'content_item',
    source_key: crypto.randomUUID(),
    lane: 'social',
    owner: 'Jordan',
    state: 'assigned',
    severity: 'normal',
    title: 'Create MSP proof asset',
    detail: 'Use campaign evidence.',
    next_action: 'Finish the asset and verify publication.',
    due_at: '2026-08-01T12:00:00.000Z',
    attempt_count: 0,
    max_attempts: 3,
    founder_required: false,
    blocker: null,
    evidence: {},
    metadata: { growth_campaign_id: 'campaign-msp' },
    verified_at: null,
    resolved_at: null,
    updated_at: '2026-07-31T11:00:00.000Z',
    ...overrides,
  };
}

describe('recurring revenue identity exclusions', () => {
  it('excludes founder, internal, Lifter, and test identities while allowing a real customer', () => {
    expect(isExcludedRevenueIdentity({ email: 'uzzielt@techehealthservices.com' })).toBe(true);
    expect(isExcludedRevenueIdentity({ email: 'founder@gmail.com', domain: 'alie.app' })).toBe(true);
    expect(isExcludedRevenueIdentity({ email: 'jack@lifter.ca' })).toBe(true);
    expect(isExcludedRevenueIdentity({ email: 'buyer+test@msp.example' })).toBe(true);
    expect(isExcludedRevenueIdentity({
      email: 'owner@northstarmsp.ca',
      metadata: { environment: 'sandbox' },
    })).toBe(true);
    expect(isExcludedRevenueIdentity({
      email: 'owner@gmail.com',
      metadata: { source: 'admin_assign_plan' },
    })).toBe(true);
    expect(isExcludedRevenueIdentity({
      domain: 'gmail.com',
      metadata: { source: 'self_serve', subscription_id: 'admin_comp:owner-id' },
    })).toBe(true);
    expect(isExcludedRevenueIdentity({
      email: 'owner@northstarmsp.ca',
      domain: 'northstarmsp.ca',
    })).toBe(false);
    expect(isExcludedRevenueIdentity({ domain: 'northstarmsp.ca' })).toBe(false);
    expect(isVerifiedStripeSubscriptionId('admin_comp_123')).toBe(false);
    expect(isVerifiedStripeSubscriptionId('sub_1AbCdEfGhIjK')).toBe(true);
  });
});
describe('daily company standup', () => {
  it('reports every department head plus Codex from evidence and shows the revenue truth', () => {
    const report = buildDailyCompanyStandup({
      snapshot,
      workforce: room.workforce,
      loops: [
        loop({
          source_type: 'campaign_experiment',
          lane: 'outreach',
          owner: 'Elena',
          state: 'verifying',
          title: 'Measure reply-first MSP follow-up',
          next_action: 'Reach the 25-send checkpoint.',
          due_at: '2026-08-02T21:30:00.000Z',
        }),
        loop({
          owner: 'Jordan',
          state: 'completed',
          title: 'Publish MSP scorecard proof',
          evidence: { destination_url: 'https://example.com/post' },
          verified_at: '2026-07-31T10:05:00.000Z',
          resolved_at: '2026-07-31T10:05:00.000Z',
        }),
      ],
      founderDecisions: [],
      verifiedRecurringCustomers: 0,
      now,
    });

    expect(report.verdict).toBe('revenue stalled with corrective action underway');
    expect(report.departments.map((department) => department.id)).toEqual([
      'maya',
      'noah',
      'priya',
      'elena',
      'sofia',
      'jordan',
      'marcus',
      'codex',
    ]);
    expect(
      report.departments
        .find((department) => department.id === 'maya')
        ?.checks.find((item) => item.key === 'revenue_action')
    ).toMatchObject({ level: 'pass' });
    expect(
      report.departments.find((department) => department.id === 'jordan')?.workedOn
    ).toContain('Publish MSP scorecard proof');

    const html = renderDailyCompanyStandupHtml(report);
    expect(html).toContain('Verified non-internal recurring customers');
    expect(html).toContain('Workspace records created / qualified first value');
    expect(html).not.toContain('Activated workspaces');
    expect(html).toContain('Maya Brooks');
    expect(html).toContain('Codex');
    expect(html).toContain('Role rubric');
    expect(html).toContain('Worked on');
    expect(html).toContain('Working next');
  });

  it('holds Maya independently accountable for missing ownership, overdue work, and weak closure', () => {
    const report = buildDailyCompanyStandup({
      snapshot,
      workforce: room.workforce,
      loops: [
        loop({
          owner: 'Jordan',
          state: 'blocked',
          next_action: null,
          blocker: null,
          due_at: '2026-07-30T12:00:00.000Z',
          attempt_count: 3,
          max_attempts: 3,
          founder_required: true,
        }),
        loop({
          owner: 'Priya',
          state: 'completed',
          title: 'Close report task without evidence',
          evidence: {},
          verified_at: null,
          resolved_at: '2026-07-31T09:00:00.000Z',
        }),
      ],
      founderDecisions: [],
      verifiedRecurringCustomers: 0,
      now,
    });

    const maya = report.departments.find((department) => department.id === 'maya');
    expect(maya?.status).toBe('needs_intervention');
    expect(maya?.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'owner_coverage', level: 'fail' }),
        expect.objectContaining({ key: 'closure_integrity', level: 'fail' }),
        expect.objectContaining({ key: 'deadline_control', level: 'fail' }),
        expect.objectContaining({ key: 'escalation_hygiene', level: 'fail' }),
      ])
    );
    expect(report.activity).toMatchObject({ overdue: 1, exhausted: 1, founderRequired: 1 });
  });

  it('keeps role rubrics explicit and changes the verdict only for verified recurring revenue', () => {
    expect(Object.keys(DEPARTMENT_RUBRICS)).toHaveLength(8);
    expect(DEPARTMENT_RUBRICS.maya).toContain(
      'Records one complete daily company standup and sends only qualifying exceptions.'
    );
    const report = buildDailyCompanyStandup({
      snapshot,
      workforce: room.workforce,
      loops: [
        loop({
          source_type: 'campaign_experiment',
          lane: 'outreach',
          owner: 'Elena',
        }),
      ],
      founderDecisions: [],
      verifiedRecurringCustomers: 1,
      now,
    });
    expect(report.verdict).toBe('healthy and growing');
  });

  it('does not let one-time payments or internal plans move the company into retention', () => {
    const report = buildDailyCompanyStandup({
      snapshot: {
        ...snapshot,
        convertedLeads: 2,
        paymentsCompleted: 2,
        paidSubscriptionsStarted: 0,
        focus: 'retain',
        focusReason: 'Conversions exist, but monitoring is inactive.',
      },
      workforce: room.workforce,
      loops: [],
      founderDecisions: [],
      verifiedRecurringCustomers: 0,
      now,
    });
    expect(report.focus).toBe('convert');
    expect(report.focusReason).toContain('No verified non-internal recurring customer');
    expect(report.departments.find((department) => department.id === 'codex')?.outcome)
      .toContain('Company focus is convert');
  });
});
