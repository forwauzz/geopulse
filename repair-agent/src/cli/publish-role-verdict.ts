import { readFile, writeFile } from 'node:fs/promises';
import { sha256 } from '../loop/canonical';
import type { EngineerArtifact, GitHubRoleObservation } from '../loop/contracts';
import { parseGitHubCheckRunObservation } from '../loop/github-observations';
import { repositoryProfileDigest } from '../loop/profile-registry';
import { GEOPULSE_PROFILE } from '../loop/repository-profile';
import { qaEngineerArtifact, reviewEngineerArtifact } from '../loop/verdicts';

type EngineerEnvelope = {
  schemaVersion: 1;
  contractMode: 'authenticated-github-v1';
  engineerArtifact: EngineerArtifact;
  evidenceDigest: string;
  repairEvidence: unknown;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const role = required('REPAIR_ROLE');
if (role !== 'reviewer' && role !== 'qa') throw new Error('REPAIR_ROLE must be reviewer or qa');
const repository = required('GITHUB_REPOSITORY');
const token = required('REPAIR_ROLE_APP_TOKEN');
const inputPath = required('REPAIR_ENGINEER_EVIDENCE');
const outputPath = required('REPAIR_ROLE_OUTPUT');
const workPassed = required('REPAIR_WORK_PASSED') === 'true';
const workReasons = (process.env.REPAIR_WORK_REASONS || '').split('\n').map((item: string) => item.trim()).filter(Boolean).slice(0, 10);
const envelope = JSON.parse(await readFile(inputPath, 'utf8')) as EngineerEnvelope;
const unsignedEnvelope = {
  schemaVersion: envelope.schemaVersion,
  contractMode: envelope.contractMode,
  repairEvidence: envelope.repairEvidence,
  engineerArtifact: envelope.engineerArtifact,
};
if (envelope.schemaVersion !== 1 || envelope.contractMode !== 'authenticated-github-v1'
  || await sha256(unsignedEnvelope) !== envelope.evidenceDigest) {
  throw new Error('engineer evidence envelope does not verify');
}
const artifact = envelope.engineerArtifact;
const profileDigest = await repositoryProfileDigest(GEOPULSE_PROFILE);
if (repository !== GEOPULSE_PROFILE.repository || artifact.repository !== repository
  || artifact.repositoryProfileDigest !== profileDigest) {
  throw new Error('role target is outside the installed repository profile');
}

const api = process.env.GITHUB_API_URL || 'https://api.github.com';
const checkName = role === 'reviewer' ? 'repair-review' : 'repair-qa';
async function github(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !body) throw new Error(`GitHub ${path} returned ${response.status}`);
  return body;
}

const initialRaw = await github(`/repos/${repository}/check-runs`, {
  method: 'POST',
  body: JSON.stringify({
    name: checkName,
    head_sha: artifact.headSha,
    status: 'completed',
    conclusion: workPassed ? 'success' : 'failure',
    output: {
      title: workPassed ? `${checkName} passed` : `${checkName} failed`,
      summary: workPassed ? 'All SHA-bound role gates passed.' : (workReasons.join('\n') || 'Role work failed closed.'),
    },
  }),
});

async function buildVerdict(observation: GitHubRoleObservation) {
  if (role === 'reviewer') {
    return reviewEngineerArtifact({
      artifact,
      profile: GEOPULSE_PROFILE,
      profileDigest,
      observation,
      observedPatchDigest: artifact.patchDigest,
      rubricPassed: workPassed,
      rubricReasons: workReasons,
    });
  }
  const commandPath = required('REPAIR_QA_COMMAND_RESULTS');
  const commandResults = JSON.parse(await readFile(commandPath, 'utf8')) as { argv: string[]; exitCode: number }[];
  return qaEngineerArtifact({
    artifact,
    profile: GEOPULSE_PROFILE,
    profileDigest,
    observation,
    observedPatchDigest: artifact.patchDigest,
    commandResults,
    postconditionPassed: required('REPAIR_POSTCONDITION_PASSED') === 'true',
  });
}

let observation = parseGitHubCheckRunObservation({ raw: initialRaw, role, repository, observedAt: new Date().toISOString() });
let verdict = await buildVerdict(observation);
if (verdict.verdict === 'failed' && observation.conclusion === 'success') {
  const patched = await github(`/repos/${repository}/check-runs/${observation.checkRunId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      conclusion: 'failure',
      output: { title: `${checkName} failed`, summary: verdict.reasons.join('\n') || 'Formal role validation failed closed.' },
    }),
  });
  observation = parseGitHubCheckRunObservation({ raw: patched, role, repository, observedAt: new Date().toISOString() });
  verdict = await buildVerdict(observation);
}
await writeFile(outputPath, `${JSON.stringify(verdict, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ role, verdict: verdict.verdict, checkRunId: verdict.issuer.checkRunId, reasons: verdict.reasons }));
if (verdict.verdict !== 'passed') process.exitCode = 1;
