import { readFile, writeFile } from 'node:fs/promises';
import { sha256 } from '../loop/canonical';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const mode = required('REPAIR_ROLLBACK_TRANSITION');
const repairAgentUrl = required('REPAIR_AGENT_URL').replace(/\/$/, '');
const token = required('REPAIR_AGENT_API_TOKEN');
const merge = JSON.parse(await readFile(required('REPAIR_MERGE_EVIDENCE'), 'utf8')) as {
  repairId: string; attempt: number; leaseId: string; mergeSha: string; gateDigest: string;
};

async function post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`${repairAgentUrl}${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok || value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} returned ${response.status}`);
  return value as Record<string, unknown>;
}

if (mode === 'intent') {
  await post('/v1/scopes/merged', { repairId: merge.repairId, attempt: merge.attempt, leaseId: merge.leaseId, mergeSha: merge.mergeSha, mergeDigest: merge.gateDigest });
  const claim = { schemaVersion: 1, repairId: merge.repairId, attempt: merge.attempt, leaseId: merge.leaseId, mergeSha: merge.mergeSha, deploymentQaResult: 'failed' };
  const rollbackIntentDigest = await sha256(claim);
  const result = await post('/v1/scopes/rollback-intent', { repairId: merge.repairId, attempt: merge.attempt, leaseId: merge.leaseId, rollbackIntentDigest });
  await writeFile(required('REPAIR_ROLLBACK_TRANSITION_OUTPUT'), `${JSON.stringify({ ...claim, rollbackIntentDigest, replayed: result['replayed'] === true }, null, 2)}\n`, 'utf8');
} else if (mode === 'complete') {
  const raw = JSON.parse(await readFile(required('REPAIR_ROLLBACK_EVIDENCE'), 'utf8')) as {
    repairId: string; attempt: number; leaseId: string; originalMergeSha: string; rollbackMergeSha: string;
    deploymentId: string; versionId: string; sourceSha: string; probesDigest: string;
  };
  if (raw.repairId !== merge.repairId || raw.attempt !== merge.attempt || raw.leaseId !== merge.leaseId
    || raw.originalMergeSha !== merge.mergeSha || raw.sourceSha !== raw.rollbackMergeSha
    || !/^[a-f0-9]{40}$/.test(raw.rollbackMergeSha) || !/^[a-f0-9]{64}$/.test(raw.probesDigest)) {
    throw new Error('rollback evidence does not match the failed deployment lineage');
  }
  const claim = { schemaVersion: 1, ...raw };
  const evidenceDigest = await sha256(claim);
  const reasons = ['production deployment QA failed; authenticated rollback completed and deployed'];
  const result = await post('/v1/scopes/rolled-back', {
    repairId: merge.repairId, attempt: merge.attempt, leaseId: merge.leaseId,
    rollbackMergeSha: raw.rollbackMergeSha, deploymentId: raw.deploymentId, versionId: raw.versionId, evidenceDigest, reasons,
  });
  await writeFile(required('REPAIR_ROLLBACK_TRANSITION_OUTPUT'), `${JSON.stringify({ ...claim, evidenceDigest, reasons, requeued: result['requeued'] === true, nextAttempt: result['nextAttempt'] ?? null, exhausted: result['exhausted'] === true, replayed: result['replayed'] === true }, null, 2)}\n`, 'utf8');
} else {
  throw new Error('REPAIR_ROLLBACK_TRANSITION must be intent or complete');
}
