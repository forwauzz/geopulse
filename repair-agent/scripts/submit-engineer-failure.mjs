#!/usr/bin/env node
import { createHash } from 'node:crypto';

const endpoint = process.env.REPAIR_AGENT_URL?.replace(/\/$/, '');
const token = process.env.REPAIR_AGENT_API_TOKEN;
const canaryId = process.env.REPAIR_CANARY_ID;
const existingRepairId = process.env.REPAIR_EXISTING_REPAIR_ID || null;
const engineerResult = process.env.REPAIR_ENGINEER_RESULT;
if (!endpoint || !token || !canaryId || !engineerResult) throw new Error('engineer failure environment is incomplete');

const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const statusResponse = await fetch(`${endpoint}/v1/status`, { headers });
if (!statusResponse.ok) throw new Error(`repair status lookup failed with ${statusResponse.status}`);
const status = await statusResponse.json();
const auditRunId = `canary-${canaryId}`;
const queued = Array.isArray(status.pendingScopes) ? status.pendingScopes : [];
let item = queued.find((candidate) => candidate?.scope?.repairId === existingRepairId)
  || queued.find((candidate) => candidate?.scope?.auditRunId === auditRunId);
if (!item) {
  console.log(JSON.stringify({ recovered: false, requeued: false, reason: 'engineer failed before a scope was leased' }));
  process.exit(0);
}
if (item.state === 'pending') {
  const recoveryLeaseId = `github-recovery-${canaryId}`;
  const claimResponse = await fetch(`${endpoint}/v1/scopes/claim`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ leaseId: recoveryLeaseId, repairId: item.scope.repairId }),
  });
  const claim = await claimResponse.json().catch(() => null);
  if (!claimResponse.ok || !claim?.scope) throw new Error(`pending scope recovery failed with ${claimResponse.status}`);
  item = { scope: claim.scope, state: 'leased', leaseId: recoveryLeaseId };
}
if (item.state !== 'leased' || typeof item.leaseId !== 'string') throw new Error('failed engineer scope is not held by an active lease');
const { repairId, attempt } = item.scope;
if (typeof repairId !== 'string' || !Number.isInteger(attempt)) throw new Error('failed engineer scope identity is invalid');
const reasons = [`engineer job ${engineerResult}`];
const feedbackClaim = { schemaVersion: 1, source: 'github-engineer-job', repairId, attempt, leaseId: item.leaseId, reasons };
const feedbackDigest = createHash('sha256').update(JSON.stringify(feedbackClaim)).digest('hex');
const response = await fetch(`${endpoint}/v1/scopes/feedback`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ repairId, attempt, leaseId: item.leaseId, feedbackDigest, reasons }),
});
const body = await response.json().catch(() => null);
if (!response.ok || body?.ok !== true) throw new Error(`engineer failure feedback failed with ${response.status}: ${JSON.stringify(body)}`);
console.log(JSON.stringify({ recovered: true, repairId, attempt, feedbackDigest, requeued: body.requeued, nextAttempt: body.nextAttempt, exhausted: body.exhausted, replayed: body.replayed }));
