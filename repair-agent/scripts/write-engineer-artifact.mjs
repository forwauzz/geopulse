#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const inputPath = process.env.REPAIR_CANARY_EVIDENCE;
const outputPath = process.env.REPAIR_ENGINEER_OUTPUT;
const baseSha = process.env.REPAIR_BASE_SHA;
const headSha = process.env.REPAIR_HEAD_SHA;
const patchDigest = process.env.REPAIR_PATCH_DIGEST;
const changedPath = process.env.REPAIR_CHANGED_PATH;
const changedLines = Number.parseInt(process.env.REPAIR_CHANGED_LINES || '', 10);
if (!inputPath || !outputPath || !changedPath) throw new Error('engineer artifact paths are incomplete');
if (!/^[a-f0-9]{40}$/.test(baseSha || '') || !/^[a-f0-9]{40}$/.test(headSha || '') || !/^[a-f0-9]{64}$/.test(patchDigest || '')) {
  throw new Error('engineer commit evidence is invalid');
}
if (!Number.isInteger(changedLines) || changedLines < 1 || changedLines > 8) throw new Error('engineer changed-line evidence is invalid');

const repairEvidence = JSON.parse(await readFile(inputPath, 'utf8'));
if (repairEvidence.schemaVersion !== 1 || typeof repairEvidence.repairId !== 'string' || typeof repairEvidence.auditRunId !== 'string') {
  throw new Error('Cloudflare repair evidence is invalid');
}
if (!Number.isInteger(repairEvidence.attempt) || repairEvidence.attempt < 1 || repairEvidence.attempt > 3 || typeof repairEvidence.leaseId !== 'string') {
  throw new Error('repair attempt or lease evidence is invalid');
}
if (repairEvidence.changedPath !== changedPath || !/^[a-f0-9]{64}$/.test(repairEvidence.artifactDigest || '')) {
  throw new Error('Cloudflare artifact does not match the Git change');
}

const engineerArtifact = {
  schemaVersion: 1,
  repairId: repairEvidence.repairId,
  auditRunId: repairEvidence.auditRunId,
  repositoryProfileId: 'geopulse-canary-v1',
  repository: 'forwauzz/geopulse',
  risk: 'low',
  attempt: repairEvidence.attempt,
  baseSha,
  headSha,
  patchDigest,
  changedPaths: [changedPath],
  changedLines,
  authorIdentity: 'github-actions:repair-engineer-shadow',
};
const unsigned = { schemaVersion: 1, repairEvidence, engineerArtifact };
const evidenceDigest = createHash('sha256').update(JSON.stringify(unsigned)).digest('hex');
const output = { ...unsigned, evidenceDigest };
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ repairId: engineerArtifact.repairId, attempt: engineerArtifact.attempt, headSha, patchDigest, evidenceDigest }));
