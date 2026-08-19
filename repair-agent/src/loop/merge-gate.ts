import { sha256 } from './canonical';
import type { EngineerArtifact, GitHubRoleObservation, MergeGateDecision, MergeGateInput, RoleVerdict } from './contracts';
import { repositoryProfileDigest } from './profile-registry';
import { artifactPathAllowed, issuerAllowed, profileSupportsAutonomousMerge } from './repository-profile';

function freshObservation(observedAt: string, evaluatedAt: string): boolean {
  const observed = Date.parse(observedAt);
  const evaluated = Date.parse(evaluatedAt);
  return Number.isFinite(observed) && Number.isFinite(evaluated) && observed <= evaluated && evaluated - observed <= 5 * 60_000;
}

async function profileDigestMatches(input: MergeGateInput): Promise<boolean> {
  try {
    return await repositoryProfileDigest(input.profile) === input.profileDigest;
  } catch {
    return false;
  }
}

async function validateVerdict(input: MergeGateInput, verdict: RoleVerdict | null, role: 'reviewer' | 'qa', reasons: string[]): Promise<void> {
  if (!verdict) {
    reasons.push(`${role} verdict is missing`);
    return;
  }
  if (verdict.schemaVersion !== 1 || verdict.contractMode !== 'authenticated-github-v1') reasons.push(`${role} verdict schema or contract mode is unsupported`);
  if (verdict.role !== role || verdict.verdict !== 'passed') reasons.push(`${role} verdict did not pass`);
  if (verdict.repairId !== input.artifact.repairId) reasons.push(`${role} repair identity does not match`);
  if (verdict.attempt !== input.artifact.attempt) reasons.push(`${role} attempt does not match`);
  if (verdict.headSha !== input.artifact.headSha || verdict.issuer.headSha !== input.artifact.headSha) reasons.push(`${role} verdict is stale for the current head SHA`);
  if (verdict.patchDigest !== input.artifact.patchDigest) reasons.push(`${role} patch digest does not match`);
  if (verdict.repositoryProfileDigest !== input.profileDigest) reasons.push(`${role} repository profile digest does not match`);
  if (verdict.engineerEvidenceDigest !== input.artifact.engineerEvidenceDigest) reasons.push(`${role} engineer evidence digest does not match`);
  if (verdict.identity === input.artifact.authorIdentity || verdict.issuer.appId === input.artifact.authorIssuer.appId) reasons.push(`${role} is not independent from engineer`);
  if (verdict.issuer.role !== role || verdict.issuer.repository !== input.profile.repository
    || !issuerAllowed(input.profile, role, verdict.issuer.appSlug, verdict.issuer.appId)) reasons.push(`${role} issuer is not authorized by the repository profile`);
  if (verdict.issuer.conclusion !== 'success') reasons.push(`${role} authenticated check did not succeed`);
  if (!Number.isSafeInteger(verdict.issuer.checkRunId) || verdict.issuer.checkRunId <= 0) reasons.push(`${role} check-run identity is invalid`);
  if (!freshObservation(verdict.issuer.observedAt, input.evaluatedAt)) reasons.push(`${role} observation is stale or invalid`);
  if (!/^[a-f0-9]{64}$/.test(verdict.workEvidenceDigest) || !/^[a-f0-9]{64}$/.test(verdict.evidenceDigest)) {
    reasons.push(`${role} evidence digest is invalid`);
  } else {
    const { evidenceDigest, ...unsigned } = verdict;
    if (await sha256(unsigned) !== evidenceDigest) reasons.push(`${role} evidence digest does not verify`);
  }
}

function validateController(input: MergeGateInput, controller: GitHubRoleObservation, reasons: string[]): void {
  if (controller.role !== 'merge-controller' || controller.repository !== input.profile.repository
    || !issuerAllowed(input.profile, 'merge-controller', controller.appSlug, controller.appId)) reasons.push('merge-controller issuer is not authorized by the repository profile');
  if (controller.headSha !== input.artifact.headSha || controller.conclusion !== 'success') reasons.push('merge-controller observation is stale or unsuccessful');
  if (!Number.isSafeInteger(controller.checkRunId) || controller.checkRunId <= 0 || !freshObservation(controller.observedAt, input.evaluatedAt)) reasons.push('merge-controller observation identity or time is invalid');
}

export async function evaluateMergeGate(input: MergeGateInput): Promise<MergeGateDecision> {
  const reasons: string[] = [];
  if (!input.enabled) reasons.push('autonomous merge is not enabled');
  if (input.killSwitch) reasons.push('repair kill switch is active');
  if (!profileSupportsAutonomousMerge(input.profile)) reasons.push('repository profile has unprovisioned or non-independent authenticated principals or checks');
  if (!await profileDigestMatches(input)) reasons.push('repository profile digest does not verify');
  if (input.risk !== 'low') reasons.push('only low-risk repairs may merge');
  if (input.artifact.risk !== input.risk) reasons.push('merge risk does not match the engineer artifact');
  if (input.artifact.schemaVersion !== 1 || input.artifact.contractMode !== 'authenticated-github-v1') reasons.push('engineer artifact schema is unsupported');
  if (input.artifact.repositoryProfileId !== input.profile.id || input.artifact.repository !== input.profile.repository) reasons.push('engineer artifact repository profile does not match');
  if (input.artifact.repositoryProfileDigest !== input.profileDigest) reasons.push('engineer artifact repository profile digest does not match');
  if (!issuerAllowed(input.profile, 'engineer', input.artifact.authorIssuer.appSlug, input.artifact.authorIssuer.appId ?? -1)) reasons.push('engineer issuer is not authorized by the repository profile');
  if (!/^[a-f0-9]{64}$/.test(input.artifact.engineerEvidenceDigest)) reasons.push('engineer evidence digest is invalid');
  if (!/^[a-f0-9]{40}$/.test(input.artifact.baseSha) || !/^[a-f0-9]{40}$/.test(input.artifact.headSha)) reasons.push('engineer artifact commit identity is invalid');
  if (!/^[a-f0-9]{64}$/.test(input.artifact.patchDigest)) reasons.push('engineer artifact patch digest is invalid');
  if (input.attemptsUsed < 1 || input.attemptsUsed > 3) reasons.push('retry ceiling is invalid or exhausted');
  if (input.attemptsUsed !== input.artifact.attempt) reasons.push('attempt count does not match the engineer artifact');
  if (input.artifact.changedPaths.length < 1 || input.artifact.changedLines < 1) reasons.push('engineer artifact has no bounded change evidence');
  if (input.artifact.changedPaths.length > input.profile.maxFiles) reasons.push('file budget exceeded');
  if (input.artifact.changedLines > input.profile.maxChangedLines) reasons.push('changed-line budget exceeded');
  if (input.artifact.changedPaths.some((path) => !artifactPathAllowed(input.profile, path))) reasons.push('engineer artifact contains a disallowed path');

  const pull = input.pullRequest;
  if (!Number.isSafeInteger(input.issueNumber) || input.issueNumber <= 0 || !Number.isSafeInteger(pull.number) || pull.number <= 0) reasons.push('issue or pull request lineage is invalid');
  if (pull.repository !== input.profile.repository || pull.state !== 'open' || pull.baseRef !== input.profile.defaultBranch) reasons.push('pull request repository, state, or base branch does not match');
  if (pull.baseSha !== input.artifact.baseSha || pull.headSha !== input.artifact.headSha) reasons.push('pull request no longer points to the reviewed base and head SHAs');
  if (!pull.mergeable) reasons.push('pull request is not mergeable');
  if (!pull.linkedIssueNumbers.includes(input.issueNumber)) reasons.push('pull request is not linked to the bounded repair issue');
  if (!freshObservation(pull.observedAt, input.evaluatedAt)) reasons.push('pull request observation is stale or invalid');

  await validateVerdict(input, input.reviewer, 'reviewer', reasons);
  await validateVerdict(input, input.qa, 'qa', reasons);
  validateController(input, input.mergeController, reasons);
  const principalIds = [input.artifact.authorIssuer.appId, input.reviewer?.issuer.appId, input.qa?.issuer.appId, input.mergeController.appId];
  if (principalIds.some((id) => id === null || id === undefined) || new Set(principalIds).size !== principalIds.length) reasons.push('engineer, reviewer, QA, and merge-controller App principals must be pairwise distinct');

  const observedCheckIds = input.checkRuns.map((check) => check.checkRunId);
  if (new Set(observedCheckIds).size !== observedCheckIds.length) reasons.push('required check-run observations contain duplicate identities');
  for (const required of input.profile.requiredChecks) {
    if (required.appId === null) {
      reasons.push(`required check principal is not provisioned: ${required.appSlug}:${required.checkName}`);
      continue;
    }
    const matches = input.checkRuns.filter((check) => check.provider === 'github'
      && check.repository === input.profile.repository
      && check.checkName === required.checkName
      && check.appSlug === required.appSlug
      && check.appId === required.appId);
    if (matches.length !== 1) {
      reasons.push(`required check observation is missing or ambiguous: ${required.appId}:${required.appSlug}:${required.checkName}`);
      continue;
    }
    const check = matches[0]!;
    if (check.headSha !== input.artifact.headSha || check.conclusion !== 'success' || !Number.isSafeInteger(check.checkRunId) || check.checkRunId <= 0
      || !freshObservation(check.observedAt, input.evaluatedAt)) reasons.push(`required check is stale or not green: ${required.appId}:${required.appSlug}:${required.checkName}`);
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
  if (feedback.length === 0 || input.artifact.attempt >= 3) return { retry: false, nextAttempt: null, feedback: [...new Set(feedback)] };
  return { retry: true, nextAttempt: input.artifact.attempt + 1, feedback: [...new Set(feedback)] };
}
