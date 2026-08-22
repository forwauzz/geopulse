import { canonicalJson, sha256 } from './canonical';
import { resolveQaCommandPreset } from './command-presets';
import type { EngineerArtifact, GitHubRoleObservation, RepositoryProfile, RoleVerdict } from './contracts';
import { artifactPathAllowed, issuerAllowed } from './repository-profile';
import { repositoryProfileDigest } from './profile-registry';

function sha(value: string): boolean {
  return /^[a-f0-9]{40}$/.test(value);
}

function principalIdentity(observation: GitHubRoleObservation): string {
  return `github-app:${observation.appId}:${observation.appSlug}:check-run:${observation.checkRunId}`;
}

async function validateObservation(args: {
  artifact: EngineerArtifact;
  profile: RepositoryProfile;
  profileDigest: string;
  observation: GitHubRoleObservation;
  role: 'reviewer' | 'qa';
  observedPatchDigest: string;
}): Promise<string[]> {
  const reasons: string[] = [];
  const { artifact, observation, profile } = args;
  if (artifact.repositoryProfileDigest !== args.profileDigest || await repositoryProfileDigest(profile) !== args.profileDigest) reasons.push('repository profile digest does not match the engineer artifact');
  if (observation.provider !== 'github' || observation.role !== args.role) reasons.push(`${args.role} issuer role is invalid`);
  if (observation.repository !== artifact.repository || observation.repository !== profile.repository) reasons.push(`${args.role} issuer repository does not match`);
  if (!issuerAllowed(profile, args.role, observation.appSlug, observation.appId)) reasons.push(`${args.role} issuer is not authorized by the repository profile`);
  if (!Number.isSafeInteger(observation.checkRunId) || observation.checkRunId <= 0) reasons.push(`${args.role} check-run identity is invalid`);
  if (observation.conclusion !== 'success') reasons.push(`${args.role} check run did not succeed`);
  if (!sha(observation.headSha) || observation.headSha !== artifact.headSha) reasons.push(`${args.role} head SHA is stale`);
  if (artifact.patchDigest !== args.observedPatchDigest) reasons.push(`${args.role} patch digest does not match`);
  if (Number.isNaN(Date.parse(observation.observedAt))) reasons.push(`${args.role} observation time is invalid`);
  if (artifact.authorIdentity === principalIdentity(observation) || artifact.authorIssuer.appId === observation.appId) reasons.push(`${args.role} must be independent from engineer`);
  return reasons;
}

export async function reviewEngineerArtifact(args: {
  artifact: EngineerArtifact;
  profile: RepositoryProfile;
  profileDigest: string;
  observation: GitHubRoleObservation;
  observedPatchDigest: string;
  rubricPassed?: boolean;
  rubricReasons?: readonly string[];
}): Promise<RoleVerdict> {
  const reasons = await validateObservation({ ...args, role: 'reviewer' });
  const { artifact, profile } = args;
  if (!sha(artifact.baseSha) || !sha(artifact.headSha)) reasons.push('artifact commit identity is invalid');
  if (!/^[a-f0-9]{64}$/.test(artifact.engineerEvidenceDigest)) reasons.push('engineer evidence digest is invalid');
  if (artifact.attempt < 1 || artifact.attempt > 3) reasons.push('attempt is outside the retry ceiling');
  if (artifact.changedPaths.length < 1 || artifact.changedPaths.length > profile.maxFiles) reasons.push('file budget exceeded');
  if (artifact.changedLines < 1 || artifact.changedLines > profile.maxChangedLines) reasons.push('changed-line budget exceeded');
  if (artifact.changedPaths.some((path) => !artifactPathAllowed(profile, path))) reasons.push('artifact contains a disallowed path');
  if (args.rubricPassed === false) reasons.push(...(args.rubricReasons?.length ? args.rubricReasons : ['review rubric failed']));
  const unique = [...new Set(reasons)];
  const identity = principalIdentity(args.observation);
  const workEvidenceDigest = await sha256({ rubricPassed: args.rubricPassed ?? true, rubricReasons: args.rubricReasons ?? [] });
  const unsigned = {
    schemaVersion: 1 as const,
    contractMode: 'authenticated-github-v1' as const,
    role: 'reviewer' as const,
    repairId: artifact.repairId,
    attempt: artifact.attempt,
    headSha: args.observation.headSha,
    patchDigest: args.observedPatchDigest,
    repositoryProfileDigest: args.profileDigest,
    engineerEvidenceDigest: artifact.engineerEvidenceDigest,
    workEvidenceDigest,
    identity,
    issuer: args.observation,
    verdict: unique.length === 0 ? 'passed' as const : 'failed' as const,
    reasons: unique,
  };
  return { ...unsigned, evidenceDigest: await sha256(unsigned) };
}

export async function qaEngineerArtifact(args: {
  artifact: EngineerArtifact;
  profile: RepositoryProfile;
  profileDigest: string;
  observation: GitHubRoleObservation;
  observedPatchDigest: string;
  commandResults: readonly { argv: readonly string[]; exitCode: number }[];
  postconditionPassed: boolean;
}): Promise<RoleVerdict> {
  const reasons = await validateObservation({ ...args, role: 'qa' });
  if (!/^[a-f0-9]{64}$/.test(args.artifact.engineerEvidenceDigest)) reasons.push('engineer evidence digest is invalid');
  const preset = resolveQaCommandPreset(args.profile.qaCommandPresetId);
  const expectedCommands = [...preset.focused, ...preset.affected, ...preset.typeCheck, ...preset.build, ...preset.browser];
  const allowed = new Set(
    expectedCommands.map((command) => canonicalJson(command))
  );
  if (args.commandResults.length === 0) reasons.push('QA supplied no command evidence');
  for (const result of args.commandResults) {
    const rendered = result.argv.join(' ');
    if (!allowed.has(canonicalJson(result.argv))) reasons.push(`QA command is not in the trusted preset: ${rendered}`);
    if (result.exitCode !== 0) reasons.push(`QA command failed: ${rendered}`);
  }
  const observedCommands = args.commandResults.map((result) => canonicalJson(result.argv));
  if (new Set(observedCommands).size !== observedCommands.length) reasons.push('QA command evidence contains duplicates');
  for (const command of expectedCommands) {
    const rendered = canonicalJson(command);
    if (!observedCommands.includes(rendered)) reasons.push(`QA command evidence is missing: ${command.join(' ')}`);
  }
  if (!args.postconditionPassed) reasons.push('finding-specific postcondition failed');
  const unique = [...new Set(reasons)];
  const identity = principalIdentity(args.observation);
  const workEvidenceDigest = await sha256({ commandResults: args.commandResults, postconditionPassed: args.postconditionPassed });
  const unsigned = {
    schemaVersion: 1 as const,
    contractMode: 'authenticated-github-v1' as const,
    role: 'qa' as const,
    repairId: args.artifact.repairId,
    attempt: args.artifact.attempt,
    headSha: args.observation.headSha,
    patchDigest: args.observedPatchDigest,
    repositoryProfileDigest: args.profileDigest,
    engineerEvidenceDigest: args.artifact.engineerEvidenceDigest,
    workEvidenceDigest,
    identity,
    issuer: args.observation,
    verdict: unique.length === 0 ? 'passed' as const : 'failed' as const,
    reasons: unique,
  };
  return { ...unsigned, evidenceDigest: await sha256(unsigned) };
}
