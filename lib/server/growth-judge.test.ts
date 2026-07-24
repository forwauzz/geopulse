import { describe, expect, it } from 'vitest';
import { judgeGrowthLoop } from './growth-judge';
import type { RevenueAgencySnapshot } from './revenue-agency-agent';

function snapshot(overrides: Partial<RevenueAgencySnapshot> = {}): RevenueAgencySnapshot {
  return {
    windowDays: 30,
    leads: 0,
    convertedLeads: 0,
    activeProspects: 20,
    outreachSends: 0,
    outreachOpens: 0,
    completedScans: 50,
    deliveredReports: 10,
    proofAssets: 12,
    publishedProof: 2,
    activeMonitoring: 0,
    pastDueMonitoring: 0,
    activeAgencyAccounts: 0,
    stages: [],
    focus: 'convert',
    focusReason: 'Conversion needs attention.',
    ...overrides,
  };
}

describe('Growth Judge', () => {
  it('targets conversion instead of blindly increasing proof volume', () => {
    const result = judgeGrowthLoop(snapshot());
    expect(result.recommendation).toContain('report-to-monitoring');
    expect(result.allowProspecting).toBe(false);
    expect(result.allowSocialProof).toBe(false);
    expect(result.allowNurture).toBe(false);
  });

  it('does not count a workspace by itself as evidence of paid conversion', () => {
    const result = judgeGrowthLoop(snapshot({ activeAgencyAccounts: 3 }));
    expect(result.recommendation).toContain('report-to-monitoring');
    expect(result.allowProspecting).toBe(false);
  });

  it('stops prospect discovery at the active-queue ceiling', () => {
    expect(judgeGrowthLoop(snapshot({ activeProspects: 100 })).allowProspecting).toBe(false);
  });

  it('pauses proof creation when the recent publishing cadence is already sufficient', () => {
    expect(judgeGrowthLoop(snapshot({ publishedProof: 8 })).allowSocialProof).toBe(false);
  });

  it('allows nurture only when consented leads exist', () => {
    expect(judgeGrowthLoop(snapshot({ leads: 3 })).allowNurture).toBe(true);
  });
});
