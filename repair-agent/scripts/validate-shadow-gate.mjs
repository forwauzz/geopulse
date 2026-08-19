#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const engineerPath = process.env.REPAIR_ENGINEER_EVIDENCE;
const reviewerPath = process.env.REPAIR_REVIEW_VERDICT;
const qaPath = process.env.REPAIR_QA_VERDICT;
const endpoint = process.env.REPAIR_AGENT_URL?.replace(/\/$/, '');
const token = process.env.REPAIR_AGENT_API_TOKEN;
const githubToken = process.env.GITHUB_TOKEN;
const githubRepository = process.env.GITHUB_REPOSITORY;
const pullRequestNumber = process.env.REPAIR_PR_NUMBER;
const githubApiUrl = process.env.REPAIR_GITHUB_API_URL?.replace(/\/$/, '') || 'https://api.github.com';
if (!engineerPath || !reviewerPath || !qaPath || !endpoint || !token || !githubToken || !githubRepository || !pullRequestNumber) throw new Error('shadow gate environment is incomplete');
if (process.env.REPAIR_AUTONOMOUS_MERGE_ENABLED !== 'false') throw new Error('shadow gate must keep autonomous merge disabled');

const engineerEnvelope = JSON.parse(await readFile(engineerPath, 'utf8'));
const reviewer = JSON.parse(await readFile(reviewerPath, 'utf8'));
const qa = JSON.parse(await readFile(qaPath, 'utf8'));
const artifact = engineerEnvelope.engineerArtifact;
const unsignedEngineer = { schemaVersion: 1, repairEvidence: engineerEnvelope.repairEvidence, engineerArtifact: artifact };
if (createHash('sha256').update(JSON.stringify(unsignedEngineer)).digest('hex') !== engineerEnvelope.evidenceDigest) {
  throw new Error('engineer evidence digest does not verify');
}
if (artifact?.schemaVersion !== 1 || artifact.repositoryProfileId !== 'geopulse-canary-v1' || artifact.repository !== 'forwauzz/geopulse' || artifact.risk !== 'low') {
  throw new Error('engineer artifact repository or risk contract is invalid');
}
if (!Array.isArray(artifact.changedPaths) || artifact.changedPaths.join(',') !== 'repair-agent/test/portable-repo/public/robots.txt') {
  throw new Error('engineer artifact path budget is invalid');
}
if (!Number.isInteger(artifact.changedLines) || artifact.changedLines < 1 || artifact.changedLines > 8) throw new Error('engineer changed-line budget is invalid');

for (const [expectedRole, verdict] of [['reviewer', reviewer], ['qa', qa]]) {
  if (verdict.schemaVersion !== 1 || verdict.role !== expectedRole || verdict.verdict !== 'passed' || verdict.repairId !== artifact.repairId) {
    throw new Error(`${expectedRole} verdict identity is invalid`);
  }
  if (verdict.attempt !== artifact.attempt || verdict.headSha !== artifact.headSha || verdict.patchDigest !== artifact.patchDigest) {
    throw new Error(`${expectedRole} verdict is stale`);
  }
  if (verdict.engineerEvidenceDigest !== engineerEnvelope.evidenceDigest || !/^[a-f0-9]{64}$/.test(verdict.evidenceDigest || '')) {
    throw new Error(`${expectedRole} evidence digest is invalid`);
  }
  const unsignedVerdict = { ...verdict };
  delete unsignedVerdict.evidenceDigest;
  if (createHash('sha256').update(JSON.stringify(unsignedVerdict)).digest('hex') !== verdict.evidenceDigest) {
    throw new Error(`${expectedRole} evidence digest does not verify`);
  }
}
if (reviewer.identity === qa.identity || reviewer.identity === artifact.authorIdentity || qa.identity === artifact.authorIdentity) {
  throw new Error('logical role identities are not distinct');
}

if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(githubRepository) || !/^\d+$/.test(pullRequestNumber)) throw new Error('GitHub pull request identity is invalid');
const pullResponse = await fetch(`${githubApiUrl}/repos/${githubRepository}/pulls/${pullRequestNumber}`, {
  headers: { authorization: `Bearer ${githubToken}`, accept: 'application/vnd.github+json' },
});
if (!pullResponse.ok) throw new Error(`pull request verification failed with ${pullResponse.status}`);
const pull = await pullResponse.json();
if (pull.state !== 'open' || pull.head?.sha !== artifact.headSha || pull.base?.sha !== artifact.baseSha) {
  throw new Error('pull request no longer points to the validated base and head SHAs');
}

const gateClaim = {
  schemaVersion: 1,
  repairId: artifact.repairId,
  attempt: artifact.attempt,
  leaseId: engineerEnvelope.repairEvidence.leaseId,
  pullRequestNumber: Number(pullRequestNumber),
  baseSha: artifact.baseSha,
  headSha: artifact.headSha,
  patchDigest: artifact.patchDigest,
  engineerEvidenceDigest: engineerEnvelope.evidenceDigest,
  reviewerEvidenceDigest: reviewer.evidenceDigest,
  qaEvidenceDigest: qa.evidenceDigest,
  mergeAllowed: false,
};
const gateDigest = createHash('sha256').update(JSON.stringify(gateClaim)).digest('hex');

const response = await fetch(`${endpoint}/v1/scopes/ack`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ repairId: artifact.repairId, attempt: artifact.attempt, leaseId: engineerEnvelope.repairEvidence.leaseId, gateDigest }),
});
if (!response.ok) throw new Error(`scope acknowledgement failed with ${response.status}: ${await response.text()}`);
console.log(JSON.stringify({
  artifactsValidated: true,
  scopeAcknowledged: true,
  mergeAllowed: false,
  reasons: ['autonomous merge is not enabled', 'logical shadow identities are not authenticated GitHub principals'],
  repairId: artifact.repairId,
  attempt: artifact.attempt,
  headSha: artifact.headSha,
  pullRequestNumber: Number(pullRequestNumber),
  gateDigest,
}));
