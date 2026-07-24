import type { RevenueAgencySnapshot } from './revenue-agency-agent';

export type GrowthJudgeDecision = {
  readonly bottleneck: RevenueAgencySnapshot['focus'];
  readonly allowProspecting: boolean;
  readonly allowSocialProof: boolean;
  readonly allowNurture: boolean;
  readonly recommendation: string;
  readonly reasons: readonly string[];
};

/**
 * A deterministic guardrail between measurement and action. It intentionally
 * optimizes for paid relationships, not raw content or contact volume.
 */
export function judgeGrowthLoop(snapshot: RevenueAgencySnapshot): GrowthJudgeDecision {
  const reasons: string[] = [];
  const conversionStalled =
    snapshot.completedScans >= 20 &&
    snapshot.convertedLeads === 0 &&
    snapshot.activeMonitoring === 0 &&
    snapshot.activeAgencyAccounts === 0;
  const prospectCapacityAvailable = snapshot.activeProspects < 100;
  const enoughRecentProof = snapshot.publishedProof >= 8;

  if (conversionStalled) {
    reasons.push(
      `${snapshot.completedScans} scans produced no paid conversion in the ${snapshot.windowDays}-day window.`
    );
  }
  if (!prospectCapacityAvailable) {
    reasons.push('The active outreach queue reached its 100-prospect safety ceiling.');
  }
  if (enoughRecentProof) {
    reasons.push('The recent proof cadence is already sufficient; more volume is not the constraint.');
  }
  if (snapshot.leads === 0) {
    reasons.push('There are no consented leads ready for nurture.');
  }

  return {
    bottleneck: snapshot.focus,
    allowProspecting: prospectCapacityAvailable,
    allowSocialProof: !enoughRecentProof,
    allowNurture: snapshot.leads > 0,
    recommendation: conversionStalled
      ? 'Improve the report-to-monitoring and agency-trial handoff before increasing content volume.'
      : snapshot.focusReason,
    reasons,
  };
}
