import type { EngineerArtifact, RepairScope, RepositoryProfile } from './contracts';
import { artifactPathAllowed, issuerAllowed } from './repository-profile';
import { repositoryProfileDigest } from './profile-registry';

export type RepositoryMutationObservation = {
  provider: 'github';
  repository: string;
  baseSha: string;
  headSha: string;
  patchDigest: string;
  changedPaths: readonly string[];
  changedLines: number;
  author: {
    appSlug: string;
    appId: number;
    runId: number;
  };
  observedAt: string;
};

function engineerIdentity(observation: RepositoryMutationObservation): string {
  return `github-app:${observation.author.appId}:${observation.author.appSlug}:run:${observation.author.runId}`;
}

export async function buildEngineerArtifact(args: {
  scope: RepairScope;
  profile: RepositoryProfile;
  profileDigest: string;
  observation: RepositoryMutationObservation;
  engineerEvidenceDigest: string;
}): Promise<EngineerArtifact> {
  const { observation, profile, scope } = args;
  if (scope.repositoryProfileId !== profile.id || scope.repository !== profile.repository || observation.repository !== profile.repository) {
    throw new Error('repository mutation does not match the repair scope profile');
  }
  if (scope.repositoryProfileDigest !== args.profileDigest || !/^[a-f0-9]{64}$/.test(args.profileDigest)
    || await repositoryProfileDigest(profile) !== args.profileDigest) {
    throw new Error('repository profile digest does not match the repair scope');
  }
  if (!issuerAllowed(profile, 'engineer', observation.author.appSlug, observation.author.appId)) {
    throw new Error('engineer issuer is not authorized by the repository profile');
  }
  if (!Number.isSafeInteger(observation.author.runId) || observation.author.runId <= 0) throw new Error('engineer run identity is invalid');
  if (!/^[a-f0-9]{40}$/.test(observation.baseSha) || !/^[a-f0-9]{40}$/.test(observation.headSha) || observation.baseSha === observation.headSha) {
    throw new Error('repository mutation commit identity is invalid');
  }
  if (!/^[a-f0-9]{64}$/.test(observation.patchDigest) || !/^[a-f0-9]{64}$/.test(args.engineerEvidenceDigest)) {
    throw new Error('repository mutation evidence digest is invalid');
  }
  if (observation.changedPaths.length < 1 || observation.changedPaths.length > scope.changeBudget.maxFiles
    || observation.changedLines < 1 || observation.changedLines > scope.changeBudget.maxChangedLines) {
    throw new Error('repository mutation exceeds the repair scope budget');
  }
  if (observation.changedPaths.some((path) => !artifactPathAllowed(profile, path))) throw new Error('repository mutation contains a disallowed path');
  if (Number.isNaN(Date.parse(observation.observedAt))) throw new Error('repository mutation observation time is invalid');
  return {
    schemaVersion: 1,
    contractMode: 'authenticated-github-v1',
    repairId: scope.repairId,
    auditRunId: scope.auditRunId,
    repositoryProfileId: profile.id,
    repositoryProfileDigest: args.profileDigest,
    repository: profile.repository,
    risk: scope.sourceFinding.risk,
    attempt: scope.attempt,
    baseSha: observation.baseSha,
    headSha: observation.headSha,
    patchDigest: observation.patchDigest,
    changedPaths: [...observation.changedPaths],
    changedLines: observation.changedLines,
    authorIdentity: engineerIdentity(observation),
    authorIssuer: { provider: 'github', appSlug: observation.author.appSlug, appId: observation.author.appId },
    engineerEvidenceDigest: args.engineerEvidenceDigest,
  };
}
