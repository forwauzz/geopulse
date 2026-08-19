import { readFile, writeFile } from 'node:fs/promises';
import { sha256 } from '../loop/canonical';
import type { DeploymentQaVerdict } from '../loop/contracts';

type MergeEvidence = {
  schemaVersion: 1;
  merged: true;
  repairId: string;
  attempt: number;
  issueNumber: number;
  mergeSha: string;
  leaseId: string;
  gateDigest: string;
};

type DeploymentEvidence = {
  verdict: DeploymentQaVerdict;
  observation: { deploymentId: string; versionId: string; sourceSha: string };
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const repository = required('GITHUB_REPOSITORY');
const mergeToken = required('REPAIR_MERGE_APP_TOKEN');
const repairAgentUrl = required('REPAIR_AGENT_URL').replace(/\/$/, '');
const repairAgentToken = required('REPAIR_AGENT_API_TOKEN');
const outputPath = required('REPAIR_FINALIZE_OUTPUT');
const merge = JSON.parse(await readFile(required('REPAIR_MERGE_EVIDENCE'), 'utf8')) as MergeEvidence;
const deployment = JSON.parse(await readFile(required('REPAIR_DEPLOYMENT_QA_EVIDENCE'), 'utf8')) as DeploymentEvidence;
if (merge.schemaVersion !== 1 || merge.merged !== true || deployment.verdict?.verdict !== 'passed'
  || deployment.verdict.repairId !== merge.repairId || deployment.verdict.sourceSha !== merge.mergeSha
  || deployment.observation?.sourceSha !== merge.mergeSha || !/^[a-f0-9]{64}$/.test(merge.gateDigest)) {
  throw new Error('production finalization evidence is invalid or did not pass');
}
const { evidenceDigest: deploymentEvidenceDigest, ...unsignedDeploymentVerdict } = deployment.verdict;
if (!/^[a-f0-9]{64}$/.test(deploymentEvidenceDigest) || await sha256(unsignedDeploymentVerdict) !== deploymentEvidenceDigest) {
  throw new Error('production deployment QA evidence digest does not verify');
}
const finalizationClaim = {
  schemaVersion: 1,
  repairId: merge.repairId,
  attempt: merge.attempt,
  mergeSha: merge.mergeSha,
  gateDigest: merge.gateDigest,
  deploymentQaEvidenceDigest: deploymentEvidenceDigest,
  deploymentId: deployment.observation.deploymentId,
  versionId: deployment.observation.versionId,
};
const finalizationDigest = await sha256(finalizationClaim);
let mergedTransition: { ok?: boolean } | null = null;
let mergedStatus = 0;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const response = await fetch(`${repairAgentUrl}/v1/scopes/merged`, {
    method: 'POST',
    headers: { authorization: `Bearer ${repairAgentToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ repairId: merge.repairId, attempt: merge.attempt, leaseId: merge.leaseId, mergeSha: merge.mergeSha, mergeDigest: merge.gateDigest }),
  });
  mergedStatus = response.status;
  mergedTransition = await response.json().catch(() => null) as { ok?: boolean } | null;
  if (response.ok && mergedTransition?.ok === true) break;
  if (attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 5_000));
}
if (mergedTransition?.ok !== true) throw new Error(`merged scope reconciliation failed after three attempts with ${mergedStatus}`);
let acknowledgement: { ok?: boolean; replayed?: boolean } | null = null;
let status = 0;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const response = await fetch(`${repairAgentUrl}/v1/scopes/ack`, {
    method: 'POST',
    headers: { authorization: `Bearer ${repairAgentToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ repairId: merge.repairId, attempt: merge.attempt, leaseId: merge.leaseId, gateDigest: finalizationDigest }),
  });
  status = response.status;
  acknowledgement = await response.json().catch(() => null) as { ok?: boolean; replayed?: boolean } | null;
  if (response.ok && acknowledgement?.ok === true) break;
  if (attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 5_000));
}
if (acknowledgement?.ok !== true) throw new Error(`production finalization failed after three attempts with ${status}`);

const githubApi = process.env.GITHUB_API_URL || 'https://api.github.com';
let issueStatus = 0;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const issueResponse = await fetch(`${githubApi}/repos/${repository}/issues/${merge.issueNumber}`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${mergeToken}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
  });
  issueStatus = issueResponse.status;
  if (issueResponse.ok) break;
  if (attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 5_000));
}
if (issueStatus < 200 || issueStatus >= 300) throw new Error(`repair issue finalization failed after three attempts with ${issueStatus}`);
const output = { schemaVersion: 1, finalized: true, repairId: merge.repairId, attempt: merge.attempt, mergeSha: merge.mergeSha, finalizationDigest, acknowledgementReplayed: acknowledgement.replayed === true };
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(output));
