import { writeFile } from 'node:fs/promises';
import { GEOPULSE_PROFILE } from '../loop/repository-profile';
import { sha256 } from '../loop/canonical';
import type { QueuedRepairScope } from '../state';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const repository = required('GITHUB_REPOSITORY');
const githubToken = required('REPAIR_MERGE_APP_TOKEN');
const repairAgentUrl = required('REPAIR_AGENT_URL').replace(/\/$/, '');
const repairAgentToken = required('REPAIR_AGENT_API_TOKEN');
const outputPath = required('REPAIR_RECOVERY_OUTPUT');
const mergeEvidencePath = required('REPAIR_MERGE_EVIDENCE');
const githubApi = process.env.GITHUB_API_URL || 'https://api.github.com';

async function github(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(`${githubApi}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${githubToken}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'x-github-api-version': '2022-11-28', ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error(`GitHub ${path} returned ${response.status}`);
  return body as Record<string, unknown>;
}

async function coordinator(path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`${repairAgentUrl}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${repairAgentToken}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok || value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`coordinator ${path} returned ${response.status}`);
  return value as Record<string, unknown>;
}

const status = await coordinator('/v1/status');
const pending = Array.isArray(status['pendingScopes']) ? status['pendingScopes'] as QueuedRepairScope[] : [];
const item = pending.find((candidate) => ['merge_pending', 'awaiting_qa', 'rollback_pending'].includes(candidate.state));
if (!item) {
  await writeFile(outputPath, `${JSON.stringify({ schemaVersion: 1, action: 'none' }, null, 2)}\n`, 'utf8');
  process.exitCode = 0;
} else {
  const intent = item.mergeIntent;
  if (!item.leaseId || !intent || !item.scope || item.scope.repository !== repository || item.scope.repositoryProfileId !== GEOPULSE_PROFILE.id) {
    throw new Error('durable lifecycle scope is incomplete or for another repository');
  }
  if (item.state === 'rollback_pending') {
    if (!item.mergeOutcome) throw new Error('rollback-pending scope has no merge outcome');
    const mergeEvidence = {
      schemaVersion: 1, merged: true, repairId: item.scope.repairId, attempt: item.scope.attempt,
      pullRequestNumber: intent.pullRequestNumber, issueNumber: intent.issueNumber, headSha: intent.headSha,
      mergeSha: item.mergeOutcome.mergeSha, leaseId: item.leaseId, gateDigest: item.mergeOutcome.mergeDigest,
      mergedTransitionRecorded: true, recovered: true,
    };
    await writeFile(mergeEvidencePath, `${JSON.stringify(mergeEvidence, null, 2)}\n`, 'utf8');
    await writeFile(outputPath, `${JSON.stringify({ schemaVersion: 1, action: 'rollback_pending', queued: true, scope: item.scope, leaseId: item.leaseId }, null, 2)}\n`, 'utf8');
  } else {
    let outcome = item.mergeOutcome;
    if (item.state === 'merge_pending') {
      const pull = await github(`/repos/${repository}/pulls/${intent.pullRequestNumber}`);
      const head = pull['head'] as Record<string, unknown> | undefined;
      const base = pull['base'] as Record<string, unknown> | undefined;
      if (pull['merged'] !== true || typeof pull['merge_commit_sha'] !== 'string' || !/^[a-f0-9]{40}$/.test(pull['merge_commit_sha'])) {
        const defaultRef = await github(`/repos/${repository}/git/ref/heads/${GEOPULSE_PROFILE.defaultBranch}`);
        const defaultObject = defaultRef['object'] as Record<string, unknown> | undefined;
        const reason = head?.['sha'] !== intent.headSha
          ? 'merge-pending PR head changed before GitHub accepted a merge'
          : base?.['sha'] !== intent.baseSha || base?.['ref'] !== GEOPULSE_PROFILE.defaultBranch || defaultObject?.['sha'] !== intent.baseSha
            ? 'merge-pending PR base changed before GitHub accepted a merge'
            : 'durable merge intent did not produce a GitHub merge before workflow termination';
        const abortClaim = { schemaVersion: 1, repairId: item.scope.repairId, attempt: item.scope.attempt, leaseId: item.leaseId, intentDigest: intent.intentDigest, reason };
        const abortDigest = await sha256(abortClaim);
        const aborted = await coordinator('/v1/scopes/merge-abort', { repairId: item.scope.repairId, attempt: item.scope.attempt, leaseId: item.leaseId, abortDigest, reasons: [abortClaim.reason] });
        await writeFile(outputPath, `${JSON.stringify({ schemaVersion: 1, action: 'aborted', repairId: item.scope.repairId, requeued: aborted['requeued'] === true }, null, 2)}\n`, 'utf8');
        process.exitCode = 0;
      } else {
        const mergeSha = pull['merge_commit_sha'];
        const commit = await github(`/repos/${repository}/commits/${mergeSha}`);
        const parents = Array.isArray(commit['parents']) ? commit['parents'] as Record<string, unknown>[] : [];
        const integrityFailure = head?.['sha'] !== intent.headSha
          ? 'recovered merged PR head does not match durable intent'
          : parents.length !== 1 || parents[0]?.['sha'] !== intent.baseSha
            ? `recovered merge commit parent does not match reviewed base ${intent.baseSha}`
            : undefined;
        const mergeDigest = await sha256({ schemaVersion: 1, repairId: item.scope.repairId, attempt: item.scope.attempt, intentDigest: intent.intentDigest, mergeSha });
        await coordinator('/v1/scopes/merged', { repairId: item.scope.repairId, attempt: item.scope.attempt, leaseId: item.leaseId, mergeSha, mergeDigest, ...(integrityFailure ? { integrityFailure } : {}) });
        outcome = { mergeSha, mergeDigest, ...(integrityFailure ? { integrityFailure } : {}) };
      }
    }
    if (outcome) {
      const mergeEvidence = {
        schemaVersion: 1, merged: true, repairId: item.scope.repairId, attempt: item.scope.attempt,
        pullRequestNumber: intent.pullRequestNumber, issueNumber: intent.issueNumber, headSha: intent.headSha,
        mergeSha: outcome.mergeSha, leaseId: item.leaseId, gateDigest: outcome.mergeDigest,
        mergedTransitionRecorded: true, recovered: true, ...(outcome.integrityFailure ? { integrityFailure: outcome.integrityFailure } : {}),
      };
      await writeFile(mergeEvidencePath, `${JSON.stringify(mergeEvidence, null, 2)}\n`, 'utf8');
      await writeFile(outputPath, `${JSON.stringify({ schemaVersion: 1, action: 'production_qa', queued: true, scope: item.scope, leaseId: item.leaseId, mergeSha: outcome.mergeSha }, null, 2)}\n`, 'utf8');
    }
  }
}
