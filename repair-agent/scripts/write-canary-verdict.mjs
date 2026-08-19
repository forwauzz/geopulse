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
const engineer = JSON.parse(await readFile(inputPath, 'utf8'));
if (typeof engineer.repairId !== 'string' || typeof engineer.artifactDigest !== 'string') throw new Error('engineer evidence is invalid');
const evidence = { schemaVersion: 1, role, repairId: engineer.repairId, headSha, patchDigest, identity, verdict: 'passed', engineerArtifactDigest: engineer.artifactDigest };
const evidenceDigest = createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
await writeFile(outputPath, `${JSON.stringify({ ...evidence, evidenceDigest, reasons: [] }, null, 2)}\n`, 'utf8');
