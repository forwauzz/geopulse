#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const endpoint = process.env.REPAIR_AGENT_URL?.replace(/\/$/, '');
const token = process.env.REPAIR_AGENT_API_TOKEN;
const engineerPath = process.env.REPAIR_ENGINEER_EVIDENCE;
const reviewerResult = process.env.REPAIR_REVIEW_RESULT;
const qaResult = process.env.REPAIR_QA_RESULT;
const gateResult = process.env.REPAIR_GATE_RESULT;
if (!endpoint || !token || !engineerPath || !reviewerResult || !qaResult || !gateResult) throw new Error('feedback environment is incomplete');
const engineer = JSON.parse(await readFile(engineerPath, 'utf8'));
const repairId = engineer.engineerArtifact?.repairId;
const attempt = engineer.engineerArtifact?.attempt;
const leaseId = engineer.repairEvidence?.leaseId;
if (typeof repairId !== 'string' || !Number.isInteger(attempt) || typeof leaseId !== 'string') throw new Error('feedback engineer evidence is invalid');
const reasons = [];
if (reviewerResult !== 'success') reasons.push(`reviewer job ${reviewerResult}`);
if (qaResult !== 'success') reasons.push(`QA job ${qaResult}`);
if (gateResult !== 'success') reasons.push(`merge gate job ${gateResult}`);
if (reasons.length === 0) throw new Error('feedback requires a failed role');
const feedbackClaim = { schemaVersion: 1, repairId, attempt, leaseId, engineerEvidenceDigest: engineer.evidenceDigest, reasons };
const feedbackDigest = createHash('sha256').update(JSON.stringify(feedbackClaim)).digest('hex');
const response = await fetch(`${endpoint}/v1/scopes/feedback`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ repairId, attempt, leaseId, feedbackDigest, reasons }),
});
const body = await response.json().catch(() => null);
if (!response.ok || body?.ok !== true) throw new Error(`scope feedback failed with ${response.status}: ${JSON.stringify(body)}`);
console.log(JSON.stringify({ repairId, attempt, feedbackDigest, reasons, requeued: body.requeued, nextAttempt: body.nextAttempt, exhausted: body.exhausted, replayed: body.replayed }));
