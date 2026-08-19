import { readFile, writeFile } from 'node:fs/promises';
import { sha256 } from '../loop/canonical';
import type { RepairScope } from '../loop/contracts';
import { repositoryProfileDigest } from '../loop/profile-registry';
import { buildEngineerArtifact } from '../loop/repository-adapter';
import { GEOPULSE_PROFILE } from '../loop/repository-profile';

type RawRepairEvidence = {
  schemaVersion: 1;
  queued: true;
  scope: RepairScope;
  leaseId: string;
  artifactDigest: string;
  changedPath: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const rawPath = required('REPAIR_RAW_EVIDENCE');
const outputPath = required('REPAIR_ENGINEER_OUTPUT');
const baseSha = required('REPAIR_BASE_SHA');
const headSha = required('REPAIR_HEAD_SHA');
const patchDigest = required('REPAIR_PATCH_DIGEST');
const changedPath = required('REPAIR_CHANGED_PATH');
const changedLines = Number.parseInt(required('REPAIR_CHANGED_LINES'), 10);
const runId = Number.parseInt(required('GITHUB_RUN_ID'), 10);
const raw = JSON.parse(await readFile(rawPath, 'utf8')) as RawRepairEvidence;
if (raw.schemaVersion !== 1 || raw.queued !== true || !raw.scope || raw.changedPath !== changedPath
  || !/^[a-f0-9]{64}$/.test(raw.artifactDigest) || typeof raw.leaseId !== 'string') {
  throw new Error('production repair evidence is invalid');
}
if (raw.scope.repositoryProfileId !== GEOPULSE_PROFILE.id || raw.scope.repository !== GEOPULSE_PROFILE.repository
  || raw.scope.sourceFinding.risk !== 'low') {
  throw new Error('production repair evidence is outside the installed repository profile');
}
const profileDigest = await repositoryProfileDigest(GEOPULSE_PROFILE);
if (raw.scope.repositoryProfileDigest !== profileDigest) throw new Error('production repository profile digest does not match');

const artifact = await buildEngineerArtifact({
  scope: raw.scope,
  profile: GEOPULSE_PROFILE,
  profileDigest,
  observation: {
    provider: 'github',
    repository: GEOPULSE_PROFILE.repository,
    baseSha,
    headSha,
    patchDigest,
    changedPaths: [changedPath],
    changedLines,
    author: { appSlug: 'github-actions', appId: 15368, runId },
    observedAt: new Date().toISOString(),
  },
  engineerEvidenceDigest: raw.artifactDigest,
});
const unsigned = {
  schemaVersion: 1 as const,
  contractMode: 'authenticated-github-v1' as const,
  repairEvidence: raw,
  engineerArtifact: artifact,
};
const evidenceDigest = await sha256(unsigned);
await writeFile(outputPath, `${JSON.stringify({ ...unsigned, evidenceDigest }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ repairId: artifact.repairId, attempt: artifact.attempt, headSha, patchDigest, evidenceDigest }));
