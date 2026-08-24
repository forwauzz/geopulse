#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const endpoint = process.env.REPAIR_AGENT_URL?.replace(/\/$/, '');
const token = process.env.REPAIR_AGENT_API_TOKEN;
const runId = process.env.REPAIR_RUN_ID;
const outputPath = process.env.REPAIR_OUTPUT;
const expectedRepairId = process.env.REPAIR_EXISTING_REPAIR_ID || null;
const repositoryRoot = resolve(process.env.REPAIR_REPOSITORY_ROOT || '.');
if (!endpoint || !token || !runId || !outputPath) throw new Error('production repair environment is incomplete');

const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
async function request(path, init = {}) {
  const response = await fetch(`${endpoint}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function writeEvidence(value) {
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

let scope = null;
let leaseId = null;
productionRun:
try {
  leaseId = `github-production-${runId}`;
  const claimed = await request('/v1/scopes/claim', {
    method: 'POST',
    body: JSON.stringify({ leaseId, ...(expectedRepairId ? { repairId: expectedRepairId } : {}) }),
  });
  scope = claimed.scope;
  if (scope === null) {
    const status = await request('/v1/status');
    const history = Array.isArray(status.auditHistory) ? status.auditHistory : [];
    const latestCanonical = history.find((item) => typeof item?.producer === 'string' && item.producer.startsWith('canonical-cloudflare-')
      && ['queued', 'duplicate', 'unsupported', 'rejected', 'exhausted', 'acknowledged'].includes(item?.outcome));
    const latestAt = Date.parse(latestCanonical?.recordedAt ?? '');
    if (!Number.isFinite(latestAt) || Date.now() - latestAt > 26 * 60 * 60_000) {
      throw new Error('no pending scope and no fresh canonical audit intake evidence');
    }
    const pending = Array.isArray(status.pendingScopes) ? status.pendingScopes : [];
    if (pending.some((item) => ['merge_pending', 'awaiting_qa', 'rollback_pending'].includes(item?.state))) {
      throw new Error('a durable merge, production QA, or rollback lifecycle still requires reconciliation');
    }
    const reason = latestCanonical.outcome === 'exhausted' || (latestCanonical.outcome === 'duplicate'
      && Array.isArray(latestCanonical.reasons) && latestCanonical.reasons.some((item) => String(item).includes('exhausted')))
      ? 'fresh canonical audit matches an exhausted repair with an owned incident; no new attempt was claimed'
      : 'fresh canonical audit has no pending eligible repair scope';
    await writeEvidence({ schemaVersion: 1, queued: false, leaseId, reason, auditRunId: latestCanonical.auditRunId, auditRecordedAt: latestCanonical.recordedAt });
    console.log(JSON.stringify({ queued: false, auditRunId: latestCanonical.auditRunId }));
    // Let undici close its fetch handles naturally. An abrupt process.exit() can
    // trip a libuv assertion on Windows and can truncate the evidence file.
    break productionRun;
  }
  if (!['canonical-cloudflare-scheduler', 'canonical-cloudflare-admin', 'canonical-cloudflare-ci'].includes(scope.producer)
    || scope.repositoryProfileId !== 'geopulse-v1'
    || scope.repository !== 'forwauzz/geopulse'
    || scope.siteOrigin !== 'https://getgeopulse.com') {
    throw new Error('claimed scope is not the installed GEO-Pulse production profile');
  }
  if (scope.sourceFinding?.checkId !== 'ai-crawler-access'
    || scope.sourceFinding?.risk !== 'low'
    || scope.sourceFinding?.confidence !== 'high'
    || scope.instruction?.skillId !== 'allow-ai-retrieval-agents'
    || scope.instruction?.path !== 'app/robots.ts') {
    throw new Error('claimed scope is outside the enabled production repair allowlist');
  }
  if (!Number.isInteger(scope.attempt) || scope.attempt < 1 || scope.attempt > 3
    || !Array.isArray(scope.feedback) || scope.feedback.length > 10
    || !/^[a-f0-9]{64}$/.test(scope.repositoryProfileDigest || '')) {
    throw new Error('claimed scope attempt, feedback, or profile evidence is invalid');
  }

  const logicalPath = scope.instruction.path;
  const physicalPath = resolve(repositoryRoot, logicalPath);
  if ((await lstat(physicalPath)).isSymbolicLink()) throw new Error('repair target may not be a symbolic link');
  const rootRealPath = await realpath(repositoryRoot);
  const targetRealPath = await realpath(physicalPath);
  const relativePath = relative(rootRealPath, targetRealPath);
  if (relativePath.startsWith('..') || relativePath.includes(':') || relativePath.replaceAll('\\', '/') !== logicalPath) {
    throw new Error('repair target escaped the checked-out repository');
  }
  const original = await readFile(targetRealPath, 'utf8');
  if (Buffer.byteLength(original, 'utf8') > 32 * 1024) throw new Error('repair target exceeds the bounded fixture size');

  const repair = {
    schemaVersion: 1,
    mode: 'shadow',
    repository: scope.repository,
    siteOrigin: scope.siteOrigin,
    idempotencyKey: `${scope.repairId}:attempt:${scope.attempt}`,
    attempt: scope.attempt,
    feedback: scope.feedback,
    finding: {
      findingId: scope.findingId,
      sourceAuditId: scope.auditRunId,
      ...scope.sourceFinding,
    },
    instruction: scope.instruction,
    changeBudget: scope.changeBudget,
    fixture: { files: { [logicalPath]: original } },
  };
  const submitted = await request('/v1/repairs', { method: 'POST', body: JSON.stringify(repair) });
  if (typeof submitted.jobId !== 'string') throw new Error('repair submission returned no job identity');

  let completed = null;
  for (let poll = 0; poll < 60; poll += 1) {
    const status = await request('/v1/status');
    completed = status.recent?.find((item) => item.jobId === submitted.jobId) ?? null;
    if (completed) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
  }
  if (!completed || completed.outcome !== 'verified_shadow') {
    const reasons = Array.isArray(completed?.reasons) ? completed.reasons.map(String) : [];
    if (completed?.outcome === 'blocked' && reasons.includes('approved retrieval-agent rules already exist')) {
      const satisfactionEvidence = {
        schemaVersion: 1,
        repairId: scope.repairId,
        attempt: scope.attempt,
        leaseId,
        beforeDigest: sha256(original),
        reasons: ['approved retrieval-agent rules already exist'],
      };
      const evidenceDigest = sha256(JSON.stringify(satisfactionEvidence));
      await request('/v1/scopes/satisfied', {
        method: 'POST',
        body: JSON.stringify({
          repairId: scope.repairId,
          attempt: scope.attempt,
          leaseId,
          evidenceDigest,
          reasons: satisfactionEvidence.reasons,
        }),
      });
      await writeEvidence({ ...satisfactionEvidence, queued: false, evidenceDigest, reason: 'repair postcondition is already satisfied' });
      console.log(JSON.stringify({ queued: false, repairId: scope.repairId, satisfied: true }));
      break productionRun;
    }
    throw new Error(`repair did not produce a verified artifact: ${JSON.stringify(completed)}`);
  }
  const artifact = (await request(`/v1/artifacts/${submitted.jobId}`)).artifact;
  const finalFiles = artifact?.finalFiles;
  if (!artifact || artifact.evidenceDigest !== completed.evidenceDigest
    || artifact.attempt !== scope.attempt
    || JSON.stringify(artifact.feedback) !== JSON.stringify(scope.feedback)
    || Object.keys(finalFiles || {}).join(',') !== logicalPath) {
    throw new Error('verified artifact inventory, attempt, or digest does not match the leased scope');
  }
  const finalContent = finalFiles[logicalPath];
  if (typeof finalContent !== 'string') throw new Error('verified artifact has no final target content');
  const finalContentSha = sha256(finalContent);
  if (artifact.changedFiles.length !== 1
    || artifact.changedFiles[0].path !== logicalPath
    || artifact.changedFiles[0].afterSha256 !== finalContentSha) {
    throw new Error('verified changed-file evidence does not bind the final content');
  }
  const manifest = JSON.stringify([{ path: logicalPath, sha256: finalContentSha }]);
  if (sha256(manifest) !== artifact.contentDigest) throw new Error('verified artifact content digest does not match returned bytes');
  await writeFile(targetRealPath, finalContent, 'utf8');

  const evidence = {
    schemaVersion: 1,
    queued: true,
    scope,
    leaseId,
    jobId: submitted.jobId,
    artifactDigest: artifact.evidenceDigest,
    beforeDigest: sha256(original),
    afterDigest: finalContentSha,
    changedPath: logicalPath,
  };
  await writeEvidence(evidence);
  console.log(JSON.stringify({ queued: true, repairId: scope.repairId, attempt: scope.attempt, changedPath: logicalPath }));
} catch (error) {
  await writeEvidence({
    schemaVersion: 1,
    queued: scope !== null,
    ...(scope ? { scope } : {}),
    ...(leaseId ? { leaseId } : {}),
    error: error instanceof Error ? error.message : 'unknown production repair failure',
  });
  throw error;
}
