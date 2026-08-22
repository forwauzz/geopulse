#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const endpoint = process.env.REPAIR_AGENT_URL?.replace(/\/$/, '');
const token = process.env.REPAIR_AGENT_API_TOKEN;
const canaryId = process.env.REPAIR_CANARY_ID;
const outputPath = process.env.REPAIR_CANARY_OUTPUT;
const existingRepairId = process.env.REPAIR_EXISTING_REPAIR_ID || null;
const targetRoot = resolve(process.env.REPAIR_CANARY_ROOT || 'test/portable-repo');
if (!endpoint || !token || !canaryId || !outputPath) throw new Error('repair canary environment is incomplete');

const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
async function request(path, init = {}) {
  const response = await fetch(`${endpoint}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const auditRunId = `canary-${canaryId}`;
const audit = {
  schemaVersion: 1,
  producer: 'github-shadow-canary',
  auditRunId,
  repositoryProfileId: 'geopulse-canary-v1',
  targetUrl: 'https://getgeopulse.com/',
  generatedAt: new Date().toISOString(),
  score: 80,
  letterGrade: 'B',
  checkCatalogVersion: 'repair-canary-v1',
  findings: [{
    findingId: `${auditRunId}:robots-sitemap`,
    checkId: 'robots-sitemap',
    status: 'FAIL',
    confidence: 'high',
    risk: 'low',
    weight: 1,
    category: 'technical-canary',
    finding: 'The controlled fixture robots.txt lacks its canonical sitemap directive.',
    fix: 'Add the exact canonical Sitemap directive once.',
    repairHint: { instruction: { skillId: 'ensure-robots-sitemap', path: 'public/robots.txt', sitemapUrl: 'https://getgeopulse.com/sitemap.xml' } },
  }],
};

let repairId = existingRepairId;
if (!repairId) {
  const submitted = await request('/v1/audits', { method: 'POST', body: JSON.stringify(audit) });
  if (submitted.queued !== true || typeof submitted.repairId !== 'string') throw new Error(`canary audit was not queued: ${JSON.stringify(submitted)}`);
  repairId = submitted.repairId;
}
if (!/^[a-f0-9]{32}$/.test(repairId)) throw new Error('repair lineage id is invalid');

const leaseId = `github-run-${canaryId}`;
const claimed = await request('/v1/scopes/claim', { method: 'POST', body: JSON.stringify({ leaseId, repairId }) });
if (!claimed.scope || claimed.scope.repairId !== repairId) throw new Error('claimed scope does not match requested canary lineage');
if (existingRepairId && (claimed.scope.attempt < 2 || !Array.isArray(claimed.scope.feedback) || claimed.scope.feedback.length === 0)) {
  throw new Error('retry scope did not carry bounded reviewer or QA feedback');
}

const logicalPath = claimed.scope.instruction.path;
if (logicalPath !== 'public/robots.txt') throw new Error(`unexpected canary path: ${logicalPath}`);
const physicalPath = resolve(targetRoot, logicalPath);
const relativePath = relative(targetRoot, physicalPath);
if (relativePath.startsWith('..') || relativePath.includes(':')) throw new Error('canary path escaped fixture root');
const original = await readFile(physicalPath, 'utf8');
const repair = {
  schemaVersion: 1,
  mode: 'shadow',
  repository: claimed.scope.repository,
  siteOrigin: claimed.scope.siteOrigin,
  idempotencyKey: `${claimed.scope.repairId}:attempt:${claimed.scope.attempt}`,
  attempt: claimed.scope.attempt,
  feedback: claimed.scope.feedback,
  finding: {
    findingId: claimed.scope.findingId,
    sourceAuditId: claimed.scope.auditRunId,
    ...claimed.scope.sourceFinding,
  },
  instruction: claimed.scope.instruction,
  changeBudget: claimed.scope.changeBudget,
  fixture: { files: { [logicalPath]: original } },
};
const repairSubmission = await request('/v1/repairs', { method: 'POST', body: JSON.stringify(repair) });
if (typeof repairSubmission.jobId !== 'string') throw new Error('repair submission returned no job id');

let completed;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const status = await request('/v1/status');
  completed = status.recent?.find((item) => item.jobId === repairSubmission.jobId);
  if (completed) break;
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
}
if (!completed || completed.outcome !== 'verified_shadow') throw new Error(`shadow repair did not verify: ${JSON.stringify(completed)}`);

const artifactResponse = await request(`/v1/artifacts/${repairSubmission.jobId}`);
const artifact = artifactResponse.artifact;
const finalFiles = artifact?.finalFiles;
if (!artifact || artifact.evidenceDigest !== completed.evidenceDigest || artifact.attempt !== claimed.scope.attempt
  || JSON.stringify(artifact.feedback) !== JSON.stringify(claimed.scope.feedback)
  || Object.keys(finalFiles || {}).join(',') !== logicalPath) {
  throw new Error('verified artifact inventory or digest does not match');
}
const finalContent = finalFiles[logicalPath];
if (typeof finalContent !== 'string') throw new Error('verified artifact has no final canary content');
const finalContentSha = createHash('sha256').update(finalContent).digest('hex');
if (artifact.changedFiles.length !== 1 || artifact.changedFiles[0].path !== logicalPath || artifact.changedFiles[0].afterSha256 !== finalContentSha) {
  throw new Error('verified changed-file evidence does not bind the final canary content');
}
const contentManifest = JSON.stringify([{ path: logicalPath, sha256: finalContentSha }]);
if (createHash('sha256').update(contentManifest).digest('hex') !== artifact.contentDigest) {
  throw new Error('verified artifact content digest does not match returned bytes');
}
await mkdir(dirname(physicalPath), { recursive: true });
await writeFile(physicalPath, finalContent, 'utf8');

const evidence = {
  schemaVersion: 1,
  auditRunId: claimed.scope.auditRunId,
  repairId,
  repositoryProfileId: claimed.scope.repositoryProfileId,
  repositoryProfileDigest: claimed.scope.repositoryProfileDigest,
  attempt: claimed.scope.attempt,
  feedback: claimed.scope.feedback,
  issue: claimed.scope.issue,
  leaseId,
  jobId: repairSubmission.jobId,
  artifactDigest: artifact.evidenceDigest,
  beforeDigest: createHash('sha256').update(original).digest('hex'),
  afterDigest: finalContentSha,
  changedPath: 'repair-agent/test/portable-repo/public/robots.txt',
};
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(evidence));
