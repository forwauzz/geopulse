import { readFile, writeFile } from 'node:fs/promises';
import { sha256 } from '../loop/canonical';
import type { DeploymentObservation, DeploymentProbe } from '../loop/contracts';
import { evaluateDeploymentQa } from '../loop/deployment-qa';
import { repositoryProfileDigest } from '../loop/profile-registry';
import { GEOPULSE_PROFILE } from '../loop/repository-profile';

type MergeEvidence = {
  schemaVersion: 1;
  merged: true;
  repairId: string;
  attempt: number;
  issueNumber: number;
  mergeSha: string;
  leaseId: string;
  gateDigest: string;
  integrityFailure?: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const repository = required('GITHUB_REPOSITORY');
const qaToken = required('REPAIR_QA_APP_TOKEN');
const mergePath = required('REPAIR_MERGE_EVIDENCE');
const outputPath = required('REPAIR_DEPLOYMENT_QA_OUTPUT');
const merge = JSON.parse(await readFile(mergePath, 'utf8')) as MergeEvidence;
if (merge.schemaVersion !== 1 || merge.merged !== true || !/^[a-f0-9]{40}$/.test(merge.mergeSha)
  || !/^[a-f0-9]{32}$/.test(merge.repairId) || !Number.isSafeInteger(merge.issueNumber)
  || !Number.isInteger(merge.attempt) || merge.attempt < 1 || merge.attempt > 3
  || typeof merge.leaseId !== 'string' || !/^[a-f0-9]{64}$/.test(merge.gateDigest)) {
  throw new Error('merge evidence is invalid');
}
if (typeof merge.integrityFailure === 'string' && merge.integrityFailure.length > 0) {
  throw new Error(`merge integrity failure requires rollback: ${merge.integrityFailure}`);
}
const api = process.env.GITHUB_API_URL || 'https://api.github.com';

async function github(token: string, path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !body) throw new Error(`GitHub ${path} returned ${response.status}`);
  return body;
}

const qaCheck = await github(qaToken, `/repos/${repository}/check-runs`, {
  method: 'POST',
  body: JSON.stringify({
    name: 'repair-production-qa',
    head_sha: merge.mergeSha,
    status: 'in_progress',
    output: { title: 'Production deployment QA', summary: 'Waiting for the exact Cloudflare deployment and configured production probes.' },
  }),
});
const qaCheckId = Number(qaCheck['id']);
if (!Number.isSafeInteger(qaCheckId) || qaCheckId <= 0) throw new Error('production QA check identity is invalid');

let cloudflareCheck: Record<string, unknown> | null = null;
for (let poll = 0; poll < 120; poll += 1) {
  const body = await github(qaToken, `/repos/${repository}/commits/${merge.mergeSha}/check-runs?check_name=${encodeURIComponent('Workers Builds: geo-pulse')}&filter=latest`);
  const runs = Array.isArray(body['check_runs']) ? body['check_runs'] as Record<string, unknown>[] : [];
  const match = runs.find((run) => {
    const app = run['app'] as Record<string, unknown> | undefined;
    return run['name'] === 'Workers Builds: geo-pulse'
      && app?.['slug'] === 'cloudflare-workers-and-pages'
      && app?.['id'] === 85455;
  });
  if (match?.['conclusion'] === 'success') {
    cloudflareCheck = match;
    break;
  }
  if (match && ['failure', 'cancelled', 'skipped'].includes(String(match['conclusion']))) {
    throw new Error(`Cloudflare deployment check ended ${String(match['conclusion'])}`);
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 15_000));
}
if (!cloudflareCheck) throw new Error('Cloudflare deployment check timed out');
if (cloudflareCheck['head_sha'] !== merge.mergeSha || !Number.isSafeInteger(cloudflareCheck['id'])) {
  throw new Error('Cloudflare deployment check is not bound to the merge SHA');
}
const detailsUrl = String(cloudflareCheck['details_url'] ?? '');
const versionId = /\/builds\/([a-f0-9-]{36})$/.exec(detailsUrl)?.[1];
if (!versionId) throw new Error('Cloudflare deployment check has no immutable build identity');
const observedAt = String(cloudflareCheck['completed_at'] ?? '');
if (Number.isNaN(Date.parse(observedAt))) throw new Error('Cloudflare deployment check has no valid completion time');
const observation: DeploymentObservation = {
  provider: 'cloudflare',
  deploymentId: `github-check-${String(cloudflareCheck['id'])}`,
  versionId,
  sourceSha: merge.mergeSha,
  environment: 'production',
  observedAt,
};
const probes: DeploymentProbe[] = [];
const requiredRobotsAgents = ['Googlebot', 'Bingbot', 'OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'];
for (const url of GEOPULSE_PROFILE.repositoryAdapter.productionSmokeUrls) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'GEO-Pulse-Repair-QA/1.0' } });
  const body = await response.arrayBuffer();
  if (url === 'https://getgeopulse.com/robots.txt') {
    const robots = new TextDecoder().decode(body);
    for (const agent of requiredRobotsAgents) {
      const block = new RegExp(`(?:^|\\n)User-[Aa]gent:\\s*${agent.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\r?\\nAllow:\\s*/\\s*(?:\\r?\\n|$)`, 'i');
      if (!block.test(robots)) throw new Error(`live robots.txt does not explicitly allow ${agent}`);
    }
  }
  probes.push({ url: new URL(url).toString(), status: response.status, finalUrl: response.url, bodyDigest: await sha256([...new Uint8Array(body)]) });
}
const profileDigest = await repositoryProfileDigest(GEOPULSE_PROFILE);
const verdict = await evaluateDeploymentQa({
  profile: GEOPULSE_PROFILE,
  profileDigest,
  repairId: merge.repairId,
  expectedSourceSha: merge.mergeSha,
  expectedDeploymentId: observation.deploymentId,
  expectedVersionId: observation.versionId,
  evaluatedAt: new Date().toISOString(),
  observation,
  probes,
});
await writeFile(outputPath, `${JSON.stringify({ verdict, observation, probes, qaCheckId }, null, 2)}\n`, 'utf8');
await github(qaToken, `/repos/${repository}/check-runs/${qaCheckId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    status: 'completed',
    conclusion: verdict.verdict === 'passed' ? 'success' : 'failure',
    output: { title: verdict.verdict === 'passed' ? 'Production QA passed' : 'Production QA failed', summary: verdict.reasons.join('\n') || `Verified Cloudflare build ${versionId} and ${probes.length} production probes.` },
  }),
});
if (verdict.verdict !== 'passed') throw new Error(`production deployment QA failed: ${verdict.reasons.join('; ')}`);
console.log(JSON.stringify({ passed: true, mergeSha: merge.mergeSha, deploymentId: observation.deploymentId, versionId, probeCount: probes.length }));
