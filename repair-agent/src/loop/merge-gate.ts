import type { EngineerArtifact, MergeGateDecision, MergeGateInput, RoleVerdict } from './contracts';
import { artifactPathAllowed } from './repository-profile';

function validateVerdict(input: MergeGateInput, verdict: RoleVerdict | null, role: 'reviewer' | 'qa', reasons: string[]): void {
  if (!verdict) {
    reasons.push(`${role} verdict is missing`);
    return;
  }
  if (verdict.role !== role || verdict.verdict !== 'passed') reasons.push(`${role} verdict did not pass`);
  if (verdict.repairId !== input.artifact.repairId) reasons.push(`${role} repair identity does not match`);
  if (verdict.attempt !== input.artifact.attempt) reasons.push(`${role} attempt does not match`);
  if (verdict.headSha !== input.artifact.headSha) reasons.push(`${role} verdict is stale for the current head SHA`);
  if (verdict.patchDigest !== input.artifact.patchDigest) reasons.push(`${role} patch digest does not match`);
  if (verdict.identity === input.artifact.authorIdentity) reasons.push(`${role} is not independent from engineer`);
  if (!/^[a-f0-9]{64}$/.test(verdict.evidenceDigest)) reasons.push(`${role} evidence digest is invalid`);
}

export function evaluateMergeGate(input: MergeGateInput): MergeGateDecision {
  const reasons: string[] = [];
  if (!input.enabled) reasons.push('autonomous merge is not enabled');
  if (input.killSwitch) reasons.push('repair kill switch is active');
  if (input.risk !== 'low') reasons.push('only low-risk repairs may merge');
  if (input.artifact.risk !== input.risk) reasons.push('merge risk does not match the engineer artifact');
  if (input.artifact.schemaVersion !== 1) reasons.push('engineer artifact schema is unsupported');
  if (input.artifact.repositoryProfileId !== input.profile.id || input.artifact.repository !== input.profile.repository) reasons.push('engineer artifact repository profile does not match');
  if (!/^[a-f0-9]{40}$/.test(input.artifact.baseSha) || !/^[a-f0-9]{40}$/.test(input.artifact.headSha)) reasons.push('engineer artifact commit identity is invalid');
  if (!/^[a-f0-9]{64}$/.test(input.artifact.patchDigest)) reasons.push('engineer artifact patch digest is invalid');
  if (input.attemptsUsed < 1 || input.attemptsUsed > 3) reasons.push('retry ceiling is invalid or exhausted');
  if (input.attemptsUsed !== input.artifact.attempt) reasons.push('attempt count does not match the engineer artifact');
  if (input.artifact.changedPaths.length < 1 || input.artifact.changedLines < 1) reasons.push('engineer artifact has no bounded change evidence');
  if (input.artifact.changedPaths.length > input.profile.maxFiles) reasons.push('file budget exceeded');
  if (input.artifact.changedLines > input.profile.maxChangedLines) reasons.push('changed-line budget exceeded');
  if (input.artifact.changedPaths.some((path) => !artifactPathAllowed(input.profile, path))) reasons.push('engineer artifact contains a disallowed path');
  validateVerdict(input, input.reviewer, 'reviewer', reasons);
  validateVerdict(input, input.qa, 'qa', reasons);
  if (input.reviewer && input.qa && input.reviewer.identity === input.qa.identity) {
    reasons.push('reviewer and QA identities must be distinct');
  }
  for (const check of input.profile.requiredChecks) {
    const identity = `${check.appSlug}:${check.workflow}/${check.job}`;
    if (input.checks[identity] !== 'success') reasons.push(`required check is not green: ${identity}`);
  }
  const unique = [...new Set(reasons)];
  return unique.length === 0 ? { allowed: true, reasons: [] } : { allowed: false, reasons: unique };
}

export function feedbackForNextAttempt(input: {
  artifact: EngineerArtifact;
  reviewer: RoleVerdict | null;
  qa: RoleVerdict | null;
}): { retry: boolean; nextAttempt: number | null; feedback: string[] } {
  const feedback = [...(input.reviewer?.reasons ?? []), ...(input.qa?.reasons ?? [])];
  if (feedback.length === 0 || input.artifact.attempt >= 3) {
    return { retry: false, nextAttempt: null, feedback: [...new Set(feedback)] };
  }
  return { retry: true, nextAttempt: input.artifact.attempt + 1, feedback: [...new Set(feedback)] };
}
