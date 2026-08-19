import type { EngineerArtifact, RepositoryProfile, RoleVerdict } from './contracts';
import { artifactPathAllowed } from './repository-profile';

async function digest(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const result = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sha(value: string): boolean {
  return /^[a-f0-9]{40}$/.test(value);
}

export async function reviewEngineerArtifact(args: {
  artifact: EngineerArtifact;
  profile: RepositoryProfile;
  reviewerIdentity: string;
  observedHeadSha: string;
  observedPatchDigest: string;
}): Promise<RoleVerdict> {
  const reasons: string[] = [];
  const { artifact, profile } = args;
  if (!sha(artifact.baseSha) || !sha(artifact.headSha)) reasons.push('artifact commit identity is invalid');
  if (artifact.headSha !== args.observedHeadSha) reasons.push('review head SHA is stale');
  if (artifact.patchDigest !== args.observedPatchDigest) reasons.push('review patch digest does not match');
  if (artifact.authorIdentity === args.reviewerIdentity) reasons.push('reviewer must be independent from engineer');
  if (artifact.attempt < 1 || artifact.attempt > 3) reasons.push('attempt is outside the retry ceiling');
  if (artifact.changedPaths.length < 1 || artifact.changedPaths.length > profile.maxFiles) reasons.push('file budget exceeded');
  if (artifact.changedLines < 1 || artifact.changedLines > profile.maxChangedLines) reasons.push('changed-line budget exceeded');
  if (artifact.changedPaths.some((path) => !artifactPathAllowed(profile, path))) reasons.push('artifact contains a disallowed path');
  const unique = [...new Set(reasons)];
  return {
    schemaVersion: 1,
    role: 'reviewer',
    repairId: artifact.repairId,
    attempt: artifact.attempt,
    headSha: args.observedHeadSha,
    patchDigest: args.observedPatchDigest,
    identity: args.reviewerIdentity,
    verdict: unique.length === 0 ? 'passed' : 'failed',
    evidenceDigest: await digest({ role: 'reviewer', artifact, reasons: unique }),
    reasons: unique,
  };
}

export async function qaEngineerArtifact(args: {
  artifact: EngineerArtifact;
  qaIdentity: string;
  observedHeadSha: string;
  observedPatchDigest: string;
  commandResults: readonly { command: string; exitCode: number }[];
  postconditionPassed: boolean;
}): Promise<RoleVerdict> {
  const reasons: string[] = [];
  if (args.artifact.authorIdentity === args.qaIdentity) reasons.push('QA must be independent from engineer');
  if (args.artifact.headSha !== args.observedHeadSha) reasons.push('QA head SHA is stale');
  if (args.artifact.patchDigest !== args.observedPatchDigest) reasons.push('QA patch digest does not match');
  if (args.commandResults.length === 0) reasons.push('QA supplied no command evidence');
  for (const result of args.commandResults) {
    if (result.exitCode !== 0) reasons.push(`QA command failed: ${result.command}`);
  }
  if (!args.postconditionPassed) reasons.push('finding-specific postcondition failed');
  const unique = [...new Set(reasons)];
  return {
    schemaVersion: 1,
    role: 'qa',
    repairId: args.artifact.repairId,
    attempt: args.artifact.attempt,
    headSha: args.observedHeadSha,
    patchDigest: args.observedPatchDigest,
    identity: args.qaIdentity,
    verdict: unique.length === 0 ? 'passed' : 'failed',
    evidenceDigest: await digest({ role: 'qa', artifact: args.artifact, commandResults: args.commandResults, reasons: unique }),
    reasons: unique,
  };
}
