import { describe, expect, it } from 'vitest';
import { buildFounderControlRoom, classifyReliabilityIncident } from './founder-control-room';
import type { AgentStatus } from './agent-console';
import type { RevenueAgencySnapshot } from './revenue-agency-agent';

const snapshot: RevenueAgencySnapshot = {
  windowDays: 30,
  leads: 12,
  convertedLeads: 0,
  activeProspects: 8,
  outreachSends: 5,
  outreachOpens: 2,
  completedScans: 10,
  deliveredReports: 8,
  proofAssets: 3,
  publishedProof: 1,
  activeMonitoring: 0,
  pastDueMonitoring: 0,
  activeAgencyAccounts: 1,
  stages: [],
  focus: 'convert',
  focusReason: 'Reports are being delivered, but customers are not starting paid monitoring.',
};

const agent = (key: string, enabled = true): AgentStatus => ({
  key,
  name: key,
  audience: 'internal',
  description: key,
  control: 'flag',
  enabled,
  killSwitch: false,
  blockers: [],
});

describe('founder control room', () => {
  it('keeps stable agent keys under six named owners and reports the real bottleneck', () => {
    const room = buildFounderControlRoom({
      agents: [
        agent('revenue_agency'),
        agent('engagement_digest'),
        agent('social_proof'),
        agent('marketing_autopilot'),
        agent('outreach'),
        agent('self_improvement'),
      ],
      snapshot,
      logs: [
        { event: 'stripe_webhook_failed', level: 'error', created_at: '2026-07-24T12:00:00Z' },
        { event: 'revenue_agency_run', level: 'info', created_at: '2026-07-24T11:00:00Z' },
      ],
    });

    expect(room.workforce.map((member) => member.name)).toEqual([
      'Maya Brooks',
      'Noah Carter',
      'Priya Shah',
      'Elena Park',
      'Jordan Reyes',
      'Marcus Reed',
    ]);
    expect(room.learningBrief.headline).toBe('Weakest handoff: convert');
    expect(room.learningBrief.recommendation).toContain('report-to-paid-monitoring');
    expect(room.incidents[0]?.area).toBe('Stripe');
    expect(room.workforce.find((member) => member.id === 'maya')?.lastAction?.event).toBe('revenue_agency_run');
  });

  it('classifies every reliability area Marcus owns', () => {
    expect(classifyReliabilityIncident('scan_queue_failed')).toBe('Queue');
    expect(classifyReliabilityIncident('report_artifact_missing')).toBe('Report');
    expect(classifyReliabilityIncident('instagram_publish_failed')).toBe('Social');
    expect(classifyReliabilityIncident('stripe_webhook_failed')).toBe('Stripe');
    expect(classifyReliabilityIncident('scheduled_cron_failed')).toBe('Schedule');
  });
});
