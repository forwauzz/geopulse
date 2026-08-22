import { readFile, writeFile } from 'node:fs/promises';
import { sha256 } from '../loop/canonical';
import type { EngineerArtifact, RoleVerdict } from '../loop/contracts';
import { GitHubObservationAdapter, type AuthenticatedGitHubReader } from '../loop/github-adapter';
import { parseRepairIssueLineageMarkers } from '../loop/github-observations';
import { evaluateMergeGate } from '../loop/merge-gate';
import { repositoryProfileDigest } from '../loop/profile-registry';
import { GEOPULSE_PROFILE } from '../loop/repository-profile';

type EngineerEnvelope = {
  schemaVersion: 1;
  contractMode: 'authenticated-github-v1';
  repairEvidence: { leaseId: string };
  engineerArtifact: EngineerArtifact;
  evidenceDigest: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const repository = required('GITHUB_REPOSITORY');
const githubActionsToken = required('REPAIR_GITHUB_ACTIONS_TOKEN');
const githubToken = required('REPAIR_MERGE_APP_TOKEN');
const repairAgentUrl = required('REPAIR_AGENT_URL').replace(/\/$/, '');
const repairAgentToken = required('REPAIR_AGENT_API_TOKEN');
const engineerPath = required('REPAIR_ENGINEER_EVIDENCE');
const reviewerPath = required('REPAIR_REVIEW_VERDICT');
const qaPath = required('REPAIR_QA_VERDICT');
const outputPath = required('REPAIR_MERGE_OUTPUT');
const pullRequestNumber = Number.parseInt(required('REPAIR_PR_NUMBER'), 10);
const issueNumber = Number.parseInt(required('REPAIR_ISSUE_NUMBER'), 10);
if (process.env.REPAIR_AUTONOMOUS_MERGE_ENABLED !== 'true') throw new Error('autonomous merge is not enabled');

const engineerEnvelope = JSON.parse(await readFile(engineerPath, 'utf8')) as EngineerEnvelope;
const reviewer = JSON.parse(await readFile(reviewerPath, 'utf8')) as RoleVerdict;
const qa = JSON.parse(await readFile(qaPath, 'utf8')) as RoleVerdict;
const unsignedEngineer = {
  schemaVersion: engineerEnvelope.schemaVersion,
  contractMode: engineerEnvelope.contractMode,
  repairEvidence: engineerEnvelope.repairEvidence,
  engineerArtifact: engineerEnvelope.engineerArtifact,
};
if (engineerEnvelope.schemaVersion !== 1 || engineerEnvelope.contractMode !== 'authenticated-github-v1'
  || await sha256(unsignedEngineer) !== engineerEnvelope.evidenceDigest) {
  throw new Error('engineer evidence envelope does not verify');
}
const artifact = engineerEnvelope.engineerArtifact;
if (repository !== GEOPULSE_PROFILE.repository || artifact.repository !== repository) throw new Error('merge repository is not installed');
const profileDigest = await repositoryProfileDigest(GEOPULSE_PROFILE);

const api = process.env.GITHUB_API_URL || 'https://api.github.com';
function safeProviderDetail(body: Record<string, unknown> | null): string {
  if (!body || typeof body['message'] !== 'string') return '';
  const message = body['message'].replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300);
  const documentationUrl = typeof body['documentation_url'] === 'string'
    && /^https:\/\/docs\.github\.com\//.test(body['documentation_url'])
    ? ` (${body['documentation_url'].slice(0, 300)})`
    : '';
  return message ? `: ${message}${documentationUrl}` : '';
}

async function github(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${githubToken}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !body) throw new Error(`GitHub ${path} returned ${response.status}${safeProviderDetail(body)}`);
  return body;
}

async function githubActions(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${githubActionsToken}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !body) throw new Error(`GitHub Actions ${path} returned ${response.status}${safeProviderDetail(body)}`);
  return body;
}

async function liveSafetyState(): Promise<{ enabled: boolean; killSwitch: boolean }> {
  const activation = await github(`/repos/${repository}/actions/variables/REPAIR_LOOP_ENABLED`);
  const healthResponse = await fetch(`${repairAgentUrl}/health`, { headers: { accept: 'application/json' } });
  const health = await healthResponse.json().catch(() => null) as { ok?: boolean; mode?: string; productionMutationsEnabled?: boolean; killSwitch?: boolean } | null;
  if (!healthResponse.ok || health?.ok !== true || health.mode !== 'shadow' || health.productionMutationsEnabled !== false) {
    throw new Error('repair-agent live safety state is unavailable or invalid');
  }
  return { enabled: activation['value'] === 'true', killSwitch: health.killSwitch !== false };
}

async function issueLineageNumbers(): Promise<readonly number[]> {
  const pull = await github(`/repos/${repository}/pulls/${pullRequestNumber}`);
  const body = typeof pull['body'] === 'string' ? pull['body'] : '';
  const markers = parseRepairIssueLineageMarkers(body);
  const verified: number[] = [];
  for (const number of [...new Set(markers)]) {
    const issue = await github(`/repos/${repository}/issues/${number}`);
    const issueBody = typeof issue['body'] === 'string' ? issue['body'] : '';
    if (issue['number'] === number
      && issue['state'] === 'open'
      && !('pull_request' in issue)
      && issueBody.includes(`Automated low-risk repair lineage \`${artifact.repairId}\``)) {
      verified.push(number);
    }
  }
  return verified;
}

const reader: AuthenticatedGitHubReader = {
  readCheckRun: (_repo, id) => github(`/repos/${repository}/check-runs/${id}`),
  readPullRequest: (_repo, number) => github(`/repos/${repository}/pulls/${number}`),
  readIssueLineageNumbers: () => issueLineageNumbers(),
};
const adapter = new GitHubObservationAdapter({ reader, repository });

async function waitForRequiredCheck(checkName: string, appSlug: string, appId: number): Promise<number> {
  for (let poll = 0; poll < 120; poll += 1) {
    const body = await github(`/repos/${repository}/commits/${artifact.headSha}/check-runs?check_name=${encodeURIComponent(checkName)}&filter=latest`);
    const runs = Array.isArray(body['check_runs']) ? body['check_runs'] as Record<string, unknown>[] : [];
    const match = runs.find((run) => {
      const app = run['app'] as Record<string, unknown> | undefined;
      return run['name'] === checkName && app?.['slug'] === appSlug && app?.['id'] === appId;
    });
    if (match && match['conclusion'] === 'success' && Number.isSafeInteger(match['id'])) return Number(match['id']);
    if (match && ['failure', 'cancelled', 'skipped'].includes(String(match['conclusion']))) {
      throw new Error(`required check failed: ${appSlug}:${checkName}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 15_000));
  }
  throw new Error(`required check timed out: ${appSlug}:${checkName}`);
}

const controllerRaw = await github(`/repos/${repository}/check-runs`, {
  method: 'POST',
  body: JSON.stringify({
    name: 'repair-merge-controller',
    head_sha: artifact.headSha,
    status: 'in_progress',
    output: { title: 'Merge controller evaluating', summary: 'Authenticated deterministic merge gate is evaluating exact-SHA evidence.' },
  }),
});
const controllerCheckRunId = Number(controllerRaw['id']);
if (!Number.isSafeInteger(controllerCheckRunId) || controllerCheckRunId <= 0) throw new Error('merge-controller check run identity is invalid');

let decision;
let requiredCheckIds: number[] = [];
try {
  requiredCheckIds = await Promise.all(GEOPULSE_PROFILE.requiredChecks.map((check) => {
    if (check.appId === null) throw new Error('required check App identity is unprovisioned');
    if (check.checkName === 'repair-review') return Promise.resolve(reviewer.issuer.checkRunId);
    if (check.checkName === 'repair-qa') return Promise.resolve(qa.issuer.checkRunId);
    return waitForRequiredCheck(check.checkName, check.appSlug, check.appId);
  }));
  const [controller, pullRequest, ...checkRuns] = await Promise.all([
    adapter.observeRole('merge-controller', controllerCheckRunId),
    adapter.observePullRequest(pullRequestNumber),
    ...requiredCheckIds.map((checkRunId) => adapter.observeRequiredCheck({ checkRunId })),
  ]);
  const safety = await liveSafetyState();
  decision = await evaluateMergeGate({
    enabled: safety.enabled,
    killSwitch: safety.killSwitch,
    risk: 'low',
    artifact,
    reviewer,
    qa,
    checkRuns,
    profile: GEOPULSE_PROFILE,
    profileDigest,
    mergeController: controller,
    pullRequest,
    issueNumber,
    evaluatedAt: new Date().toISOString(),
    attemptsUsed: artifact.attempt,
  });
} catch (error) {
  decision = { allowed: false as const, reasons: [error instanceof Error ? error.message : 'merge evidence acquisition failed'] };
}

if (!decision.allowed) {
  await github(`/repos/${repository}/check-runs/${controllerCheckRunId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed', conclusion: 'failure', output: { title: 'Repair merge blocked', summary: decision.reasons.join('\n') } }),
  });
  await writeFile(outputPath, `${JSON.stringify({ schemaVersion: 1, merged: false, repairId: artifact.repairId, attempt: artifact.attempt, reasons: decision.reasons }, null, 2)}\n`, 'utf8');
  throw new Error(`merge gate rejected the repair: ${decision.reasons.join('; ')}`);
}

const finalSafety = await liveSafetyState();
if (!finalSafety.enabled || finalSafety.killSwitch) {
  await github(`/repos/${repository}/check-runs/${controllerCheckRunId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed', conclusion: 'failure', output: { title: 'Repair merge blocked', summary: 'The live repair-loop activation or kill switch changed before merge.' } }),
  });
  throw new Error('live repair safety switch blocked merge');
}

const verifyIndex = GEOPULSE_PROFILE.requiredChecks.findIndex((check) => check.checkName === 'verify'
  && check.appSlug === 'github-actions' && check.appId === 15368);
if (verifyIndex < 0) throw new Error('authenticated exact-SHA CI source is unavailable for PR attestation');
const sourceVerifyCheckRunId = requiredCheckIds[verifyIndex];
if (sourceVerifyCheckRunId === undefined || !Number.isSafeInteger(sourceVerifyCheckRunId) || sourceVerifyCheckRunId <= 0) {
  throw new Error('authenticated exact-SHA CI source is unavailable for PR attestation');
}
const verifyAttestationDigest = await sha256({
  schemaVersion: 1,
  repairId: artifact.repairId,
  attempt: artifact.attempt,
  headSha: artifact.headSha,
  patchDigest: artifact.patchDigest,
  sourceVerifyCheckRunId,
});
const verifyAttestation = await githubActions(`/repos/${repository}/check-runs`, {
  method: 'POST',
  body: JSON.stringify({
    name: 'verify',
    head_sha: artifact.headSha,
    status: 'completed',
    conclusion: 'success',
    external_id: `repair-verify:${artifact.repairId}:${artifact.attempt}:${verifyAttestationDigest}`,
    output: {
      title: 'Exact-SHA CI attested for protected-main evaluation',
      summary: `Authenticated GitHub Actions check run ${sourceVerifyCheckRunId} passed for ${artifact.headSha}; deterministic attestation ${verifyAttestationDigest}.`,
    },
  }),
});
const verifyAttestationApp = verifyAttestation['app'] as Record<string, unknown> | undefined;
if (verifyAttestation['name'] !== 'verify' || verifyAttestation['head_sha'] !== artifact.headSha
  || verifyAttestation['status'] !== 'completed' || verifyAttestation['conclusion'] !== 'success'
  || verifyAttestationApp?.['slug'] !== 'github-actions' || verifyAttestationApp?.['id'] !== 15368
  || !Number.isSafeInteger(verifyAttestation['id'])) {
  throw new Error('GitHub Actions exact-SHA CI attestation identity is invalid');
}

const intentClaim = {
  schemaVersion: 1,
  repairId: artifact.repairId,
  attempt: artifact.attempt,
  leaseId: engineerEnvelope.repairEvidence.leaseId,
  pullRequestNumber,
  issueNumber,
  baseSha: artifact.baseSha,
  headSha: artifact.headSha,
  patchDigest: artifact.patchDigest,
  controllerCheckRunId,
  requiredCheckRunIds: requiredCheckIds,
};
const intentDigest = await sha256(intentClaim);
const intentResponse = await fetch(`${repairAgentUrl}/v1/scopes/merge-intent`, {
  method: 'POST',
  headers: { authorization: `Bearer ${repairAgentToken}`, 'content-type': 'application/json' },
  body: JSON.stringify({ ...intentClaim, intentDigest }),
});
const intentBody = await intentResponse.json().catch(() => null) as { ok?: boolean } | null;
if (!intentResponse.ok || intentBody?.ok !== true) throw new Error(`durable merge intent failed with ${intentResponse.status}`);

async function abortMergeIntent(reason: string): Promise<void> {
  const abortDigest = await sha256({
    schemaVersion: 1,
    repairId: artifact.repairId,
    attempt: artifact.attempt,
    leaseId: engineerEnvelope.repairEvidence.leaseId,
    intentDigest,
    reason,
  });
  const abortResponse = await fetch(`${repairAgentUrl}/v1/scopes/merge-abort`, {
    method: 'POST',
    headers: { authorization: `Bearer ${repairAgentToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      repairId: artifact.repairId,
      attempt: artifact.attempt,
      leaseId: engineerEnvelope.repairEvidence.leaseId,
      abortDigest,
      reasons: [reason],
    }),
  });
  const abortBody = await abortResponse.json().catch(() => null) as { ok?: boolean; requeued?: boolean } | null;
  if (!abortResponse.ok || abortBody?.ok !== true || abortBody.requeued !== true) {
    throw new Error(`${reason}; durable abort failed with ${abortResponse.status}`);
  }
  await writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    merged: false,
    repairId: artifact.repairId,
    attempt: artifact.attempt,
    reasons: [reason],
    requeued: true,
  }, null, 2)}\n`, 'utf8');
}

await github(`/repos/${repository}/check-runs/${controllerCheckRunId}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'in_progress', output: { title: 'Repair merge authorized', summary: `Durable intent recorded; merging exact reviewed head ${artifact.headSha}.` } }),
});

let merged: Record<string, unknown>;
const currentPull = await github(`/repos/${repository}/pulls/${pullRequestNumber}`);
const currentDefaultRef = await github(`/repos/${repository}/git/ref/heads/${GEOPULSE_PROFILE.defaultBranch}`);
const currentHead = currentPull['head'] as Record<string, unknown> | undefined;
const currentBase = currentPull['base'] as Record<string, unknown> | undefined;
const currentDefaultObject = currentDefaultRef['object'] as Record<string, unknown> | undefined;
if (currentHead?.['sha'] !== artifact.headSha) {
  const reason = 'pull request head changed after durable merge intent';
  await abortMergeIntent(reason);
  throw new Error(reason);
}
if (currentBase?.['sha'] !== artifact.baseSha || currentBase?.['ref'] !== GEOPULSE_PROFILE.defaultBranch || currentDefaultObject?.['sha'] !== artifact.baseSha) {
  const reason = 'pull request base changed after review and before merge';
  await abortMergeIntent(reason);
  throw new Error(reason);
}
if (currentPull['merged'] === true && typeof currentPull['merge_commit_sha'] === 'string') {
  merged = { merged: true, sha: currentPull['merge_commit_sha'] };
} else {
  try {
    merged = await github(`/repos/${repository}/pulls/${pullRequestNumber}/merge`, {
      method: 'PUT',
      body: JSON.stringify({ sha: artifact.headSha, merge_method: 'squash', commit_title: `[REPAIR] ${artifact.repairId} attempt ${artifact.attempt}` }),
    });
  } catch (error) {
    const reconciled = await github(`/repos/${repository}/pulls/${pullRequestNumber}`);
    const reconciledHead = reconciled['head'] as Record<string, unknown> | undefined;
    if (reconciled['merged'] === true && reconciledHead?.['sha'] === artifact.headSha && typeof reconciled['merge_commit_sha'] === 'string') {
      merged = { merged: true, sha: reconciled['merge_commit_sha'] };
    } else {
      const reason = error instanceof Error ? error.message : 'GitHub merge failed after authorization.';
      await abortMergeIntent(reason);
      await github(`/repos/${repository}/check-runs/${controllerCheckRunId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', conclusion: 'failure', output: { title: 'Repair merge failed; attempt requeued', summary: reason } }),
      }).catch(() => undefined);
      throw error;
    }
  }
}
if (merged['merged'] !== true || typeof merged['sha'] !== 'string' || !/^[a-f0-9]{40}$/.test(merged['sha'])) {
  const reason = `GitHub did not merge the validated head SHA: ${String(merged['message'] ?? 'unknown error')}`;
  await abortMergeIntent(reason);
  await github(`/repos/${repository}/check-runs/${controllerCheckRunId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed', conclusion: 'failure', output: { title: 'Repair merge failed; attempt requeued', summary: reason } }),
  });
  throw new Error(reason);
}
const mergeSha = merged['sha'];
const mergeCommit = await github(`/repos/${repository}/commits/${mergeSha}`);
const mergeParents = Array.isArray(mergeCommit['parents']) ? mergeCommit['parents'] as Record<string, unknown>[] : [];
const integrityFailure = mergeParents.length !== 1 || mergeParents[0]?.['sha'] !== artifact.baseSha
  ? `merged commit parent does not match reviewed base ${artifact.baseSha}`
  : null;
const gateClaim = {
  schemaVersion: 1,
  repairId: artifact.repairId,
  attempt: artifact.attempt,
  pullRequestNumber,
  issueNumber,
  baseSha: artifact.baseSha,
  headSha: artifact.headSha,
  mergeSha,
  patchDigest: artifact.patchDigest,
  repositoryProfileDigest: profileDigest,
  reviewerEvidenceDigest: reviewer.evidenceDigest,
  qaEvidenceDigest: qa.evidenceDigest,
  controllerCheckRunId,
};
const gateDigest = await sha256(gateClaim);
const output = { schemaVersion: 1, merged: true, repairId: artifact.repairId, attempt: artifact.attempt, pullRequestNumber, issueNumber, headSha: artifact.headSha, mergeSha, leaseId: engineerEnvelope.repairEvidence.leaseId, gateDigest, mergedTransitionReplayed: false, ...(integrityFailure ? { integrityFailure } : {}) };
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
let mergedTransition: { ok?: boolean; replayed?: boolean } | null = null;
let mergedTransitionStatus = 0;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    const response = await fetch(`${repairAgentUrl}/v1/scopes/merged`, {
      method: 'POST',
      headers: { authorization: `Bearer ${repairAgentToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ repairId: artifact.repairId, attempt: artifact.attempt, leaseId: engineerEnvelope.repairEvidence.leaseId, mergeSha, mergeDigest: gateDigest, ...(integrityFailure ? { integrityFailure } : {}) }),
    });
    mergedTransitionStatus = response.status;
    mergedTransition = await response.json().catch(() => null) as { ok?: boolean; replayed?: boolean } | null;
    if (response.ok && mergedTransition?.ok === true) break;
  } catch {
    mergedTransitionStatus = 0;
  }
  if (attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 5_000));
}
const transitionRecorded = mergedTransition?.ok === true;
if (!transitionRecorded || integrityFailure) {
  await github(`/repos/${repository}/check-runs/${controllerCheckRunId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed', conclusion: 'failure', output: { title: integrityFailure ? 'Repair merged on an unexpected base' : 'Repair merged; reconciliation required', summary: integrityFailure ?? 'GitHub merged the exact SHA, but the durable scope could not enter awaiting-production-QA after three attempts.' } }),
  }).catch(() => undefined);
} else {
  await github(`/repos/${repository}/check-runs/${controllerCheckRunId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed', conclusion: 'success', output: { title: 'Repair merged', summary: `Merged exact reviewed head ${artifact.headSha} as ${mergeSha}.` } }),
  }).catch(() => undefined);
}
const completedOutput = { ...output, mergedTransitionRecorded: transitionRecorded, mergedTransitionReplayed: mergedTransition?.replayed === true, ...(transitionRecorded ? {} : { reconciliationReason: `merged scope transition failed after three attempts with ${mergedTransitionStatus}` }) };
await writeFile(outputPath, `${JSON.stringify(completedOutput, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(completedOutput));
