import { sha256 } from './canonical';
import type {
  DeploymentObservation,
  DeploymentProbe,
  DeploymentQaVerdict,
  RepositoryProfile,
} from './contracts';
import { repositoryProfileDigest } from './profile-registry';

export function deploymentQaUrls(profile: RepositoryProfile, environment: 'preview' | 'production', sourceSha: string): string[] {
  if (environment === 'production') return profile.repositoryAdapter.productionSmokeUrls.map((value) => new URL(value).toString());
  const template = profile.repositoryAdapter.previewUrlTemplate;
  if (!template) return [];
  const origin = new URL(template.replace('{sha}', sourceSha));
  return profile.repositoryAdapter.previewSmokePaths.map((path) => new URL(path, origin).toString());
}

export async function evaluateDeploymentQa(args: {
  profile: RepositoryProfile;
  profileDigest: string;
  repairId: string;
  expectedSourceSha: string;
  expectedDeploymentId: string;
  expectedVersionId: string;
  evaluatedAt: string;
  observation: DeploymentObservation;
  probes: readonly DeploymentProbe[];
}): Promise<DeploymentQaVerdict> {
  const reasons: string[] = [];
  const { observation, profile } = args;
  try {
    if (!/^[a-f0-9]{64}$/.test(args.profileDigest) || await repositoryProfileDigest(profile) !== args.profileDigest) reasons.push('repository profile digest does not verify');
  } catch {
    reasons.push('repository profile digest does not verify');
  }
  if (observation.provider !== profile.repositoryAdapter.deploymentProvider) reasons.push('deployment provider does not match the installed repository profile');
  if (!/^[a-f0-9]{40}$/.test(args.expectedSourceSha) || observation.sourceSha !== args.expectedSourceSha) reasons.push('deployment source SHA does not match');
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(observation.deploymentId) || !/^[A-Za-z0-9._:-]{1,160}$/.test(observation.versionId)) reasons.push('deployment identity is invalid');
  if (observation.deploymentId !== args.expectedDeploymentId || observation.versionId !== args.expectedVersionId) reasons.push('deployment ID or version does not match the released artifact');
  const observedAt = Date.parse(observation.observedAt);
  const evaluatedAt = Date.parse(args.evaluatedAt);
  if (!Number.isFinite(observedAt) || !Number.isFinite(evaluatedAt) || observedAt > evaluatedAt || evaluatedAt - observedAt > 10 * 60_000) reasons.push('deployment observation time is stale or invalid');
  const expected = deploymentQaUrls(profile, observation.environment, args.expectedSourceSha);
  if (expected.length === 0) reasons.push(`${observation.environment} QA URLs are not configured`);
  const expectedSet = new Set(expected);
  const observedSet = new Set<string>();
  for (const probe of args.probes) {
    let url: URL;
    let finalUrl: URL;
    try {
      url = new URL(probe.url);
      finalUrl = new URL(probe.finalUrl);
    } catch {
      reasons.push('deployment probe URL is invalid');
      continue;
    }
    const normalized = url.toString();
    if (!expectedSet.has(normalized)) reasons.push(`deployment probe is outside the configured inventory: ${normalized}`);
    if (finalUrl.toString() !== normalized) reasons.push(`deployment probe redirected outside its exact URL contract: ${normalized}`);
    if (!Number.isInteger(probe.status) || probe.status < 200 || probe.status >= 400) reasons.push(`deployment probe failed: ${normalized}`);
    if (!/^[a-f0-9]{64}$/.test(probe.bodyDigest)) reasons.push(`deployment probe body digest is invalid: ${normalized}`);
    if (observedSet.has(normalized)) reasons.push(`deployment probe is duplicated: ${normalized}`);
    observedSet.add(normalized);
  }
  for (const url of expected) if (!observedSet.has(url)) reasons.push(`deployment probe is missing: ${url}`);
  const unique = [...new Set(reasons)];
  const probeEvidenceDigest = await sha256(args.probes);
  const unsigned = {
    schemaVersion: 1 as const,
    repositoryProfileId: profile.id,
    repositoryProfileDigest: args.profileDigest,
    repairId: args.repairId,
    sourceSha: args.expectedSourceSha,
    deploymentId: observation.deploymentId,
    versionId: observation.versionId,
    environment: observation.environment,
    verdict: unique.length === 0 ? 'passed' as const : 'failed' as const,
    probeEvidenceDigest,
    reasons: unique,
  };
  const evidenceDigest = await sha256(unsigned);
  return { ...unsigned, evidenceDigest };
}
