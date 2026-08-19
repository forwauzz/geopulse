#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const role = process.env.REPAIR_ROLE;
const identity = process.env.REPAIR_ROLE_IDENTITY;
const headSha = process.env.REPAIR_HEAD_SHA;
const patchDigest = process.env.REPAIR_PATCH_DIGEST;
const inputPath = process.env.REPAIR_ENGINEER_EVIDENCE;
const outputPath = process.env.REPAIR_ROLE_OUTPUT;
if (!['reviewer', 'qa'].includes(role) || !identity || !inputPath || !outputPath) throw new Error('role verdict environment is incomplete');
if (!/^[a-f0-9]{40}$/.test(headSha || '') || !/^[a-f0-9]{64}$/.test(patchDigest || '')) throw new Error('role verdict commit evidence is invalid');

const envelope = JSON.parse(await readFile(inputPath, 'utf8'));
const artifact = envelope.engineerArtifact;
if (envelope.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(envelope.evidenceDigest || '') || artifact?.schemaVersion !== 1) {
  throw new Error('engineer evidence envelope is invalid');
}
if (artifact.headSha !== headSha || artifact.patchDigest !== patchDigest) throw new Error('role target does not match the engineer artifact');
if (artifact.authorIdentity === identity || !Number.isInteger(artifact.attempt) || artifact.attempt < 1 || artifact.attempt > 3) {
  throw new Error('role independence or attempt evidence is invalid');
}

const unsigned = {
  schemaVersion: 1,
  role,
  repairId: artifact.repairId,
  attempt: artifact.attempt,
  headSha,
  patchDigest,
  identity,
  verdict: 'passed',
  engineerEvidenceDigest: envelope.evidenceDigest,
  reasons: [],
};
const evidenceDigest = createHash('sha256').update(JSON.stringify(unsigned)).digest('hex');
await writeFile(outputPath, `${JSON.stringify({ ...unsigned, evidenceDigest }, null, 2)}\n`, 'utf8');
