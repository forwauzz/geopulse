#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const endpoint = process.env.REPAIR_AGENT_URL?.replace(/\/$/, '');
const token = process.env.REPAIR_AGENT_API_TOKEN;
const rawPath = process.env.REPAIR_RAW_EVIDENCE;
const engineerPath = process.env.REPAIR_ENGINEER_EVIDENCE;
const outputPath = process.env.REPAIR_FEEDBACK_OUTPUT;
const runId = process.env.REPAIR_RUN_ID;
if (!endpoint || !token || !outputPath || !runId) throw new Error('production feedback environment is incomplete');
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

async function optionalJson(path) {
  if (!path) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

const raw = await optionalJson(rawPath);
const engineer = await optionalJson(engineerPath);
const gate = await optionalJson(process.env.REPAIR_GATE_EVIDENCE);
const rollback = await optionalJson(process.env.REPAIR_ROLLBACK_TRANSITION_EVIDENCE);
if (gate?.merged === true) {
  const authenticatedRollback = rollback?.repairId === gate.repairId
    && rollback?.attempt === gate.attempt
    && rollback?.originalMergeSha === gate.mergeSha
    && typeof rollback?.rollbackMergeSha === 'string'
    && typeof rollback?.evidenceDigest === 'string';
  if (!authenticatedRollback) {
    const output = { recovered: true, requeued: false, repairId: gate.repairId, attempt: gate.attempt, reason: 'repair already merged; production QA or durable reconciliation owns the next transition' };
    await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(output));
    process.exit(0);
  }
}
let scope = raw?.scope ?? engineer?.repairEvidence?.scope ?? null;
let leaseId = raw?.leaseId ?? engineer?.repairEvidence?.leaseId ?? null;
if (!scope || !leaseId) {
  const response = await fetch(`${endpoint}/v1/status`, { headers });
  const status = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`repair status lookup failed with ${response.status}`);
  const expectedLeaseId = `github-production-${runId}`;
  const item = status?.pendingScopes?.find((candidate) => candidate?.state === 'leased' && candidate?.leaseId === expectedLeaseId);
  scope = item?.scope ?? null;
  leaseId = item?.leaseId ?? null;
}
if (!scope || typeof scope.repairId !== 'string' || !Number.isInteger(scope.attempt) || typeof leaseId !== 'string') {
  const output = { recovered: false, requeued: false, reason: 'failure occurred before a repair scope was leased' };
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(output));
  process.exit(0);
}
const liveResponse = await fetch(`${endpoint}/v1/status`, { headers });
const liveStatus = await liveResponse.json().catch(() => null);
if (!liveResponse.ok) throw new Error(`repair status lookup failed with ${liveResponse.status}`);
const liveItem = liveStatus?.pendingScopes?.find((candidate) => candidate?.scope?.repairId === scope.repairId);
if (liveItem && liveItem.state !== 'leased') {
  const output = { recovered: true, requeued: false, repairId: scope.repairId, attempt: scope.attempt, reason: `durable ${liveItem.state} lifecycle owns reconciliation` };
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(output));
  process.exit(0);
}

const reasons = [];
for (const [label, value] of [
  ['engineer', process.env.REPAIR_ENGINEER_RESULT],
  ['reviewer', process.env.REPAIR_REVIEW_RESULT],
  ['QA', process.env.REPAIR_QA_RESULT],
  ['merge gate', process.env.REPAIR_GATE_RESULT],
  ['deployment QA', process.env.REPAIR_DEPLOYMENT_RESULT],
]) {
  if (value && value !== 'success' && value !== 'skipped') reasons.push(`${label} job ${value}`);
}
for (const path of [process.env.REPAIR_REVIEW_VERDICT, process.env.REPAIR_QA_VERDICT]) {
  const evidence = await optionalJson(path);
  if (Array.isArray(evidence?.reasons)) reasons.push(...evidence.reasons.filter((item) => typeof item === 'string'));
  if (Array.isArray(evidence?.verdict?.reasons)) reasons.push(...evidence.verdict.reasons.filter((item) => typeof item === 'string'));
}
const boundedReasons = [...new Set(reasons.map((reason) => reason.trim()).filter(Boolean))].slice(0, 10);
if (boundedReasons.length === 0) boundedReasons.push('repair loop failed without structured role evidence');
const claim = { schemaVersion: 1, source: 'github-production-loop', repairId: scope.repairId, attempt: scope.attempt, leaseId, reasons: boundedReasons };
const feedbackDigest = createHash('sha256').update(JSON.stringify(claim)).digest('hex');
const response = await fetch(`${endpoint}/v1/scopes/feedback`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ repairId: scope.repairId, attempt: scope.attempt, leaseId, feedbackDigest, reasons: boundedReasons }),
});
const body = await response.json().catch(() => null);
if (!response.ok || body?.ok !== true) throw new Error(`production scope feedback failed with ${response.status}: ${JSON.stringify(body)}`);
const output = { recovered: true, repairId: scope.repairId, attempt: scope.attempt, feedbackDigest, reasons: boundedReasons, requeued: body.requeued, nextAttempt: body.nextAttempt, exhausted: body.exhausted, replayed: body.replayed };
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(output));
