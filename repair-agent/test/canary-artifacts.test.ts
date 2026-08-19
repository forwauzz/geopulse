import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const engineerScript = new URL('../scripts/write-engineer-artifact.mjs', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const verdictScript = new URL('../scripts/write-canary-verdict.mjs', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const gateScript = new URL('../scripts/validate-shadow-gate.mjs', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const canaryScript = new URL('../scripts/run-shadow-canary.mjs', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const engineerFailureScript = new URL('../scripts/submit-engineer-failure.mjs', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('live canary artifact scripts', () => {
  it('binds the engineer, reviewer, and QA artifacts to one SHA and acknowledges only after validation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'repair-canary-artifacts-'));
    temporaryDirectories.push(directory);
    const rawPath = join(directory, 'raw.json');
    const engineerPath = join(directory, 'engineer.json');
    const reviewPath = join(directory, 'review.json');
    const qaPath = join(directory, 'qa.json');
    const repairId = 'd'.repeat(32);
    const baseSha = 'a'.repeat(40);
    const headSha = 'b'.repeat(40);
    const patchDigest = 'c'.repeat(64);
    const changedPath = 'repair-agent/test/portable-repo/public/robots.txt';
    await writeFile(rawPath, JSON.stringify({
      schemaVersion: 1,
      auditRunId: 'canary-run-1',
      repairId,
      attempt: 1,
      leaseId: 'github-run-canary-12345',
      artifactDigest: 'e'.repeat(64),
      beforeDigest: 'f'.repeat(64),
      afterDigest: '1'.repeat(64),
      changedPath,
    }), 'utf8');

    execFileSync(process.execPath, [engineerScript], {
      env: {
        ...process.env,
        REPAIR_CANARY_EVIDENCE: rawPath,
        REPAIR_ENGINEER_OUTPUT: engineerPath,
        REPAIR_BASE_SHA: baseSha,
        REPAIR_HEAD_SHA: headSha,
        REPAIR_PATCH_DIGEST: patchDigest,
        REPAIR_CHANGED_PATH: changedPath,
        REPAIR_CHANGED_LINES: '2',
      },
    });
    const engineer = JSON.parse(await readFile(engineerPath, 'utf8')) as Record<string, any>;
    expect(engineer.engineerArtifact).toMatchObject({ repairId, attempt: 1, baseSha, headSha, patchDigest, changedPaths: [changedPath] });

    for (const [role, identity, output] of [
      ['reviewer', 'repair-reviewer-logical-shadow', reviewPath],
      ['qa', 'repair-qa-logical-shadow', qaPath],
    ] as const) {
      execFileSync(process.execPath, [verdictScript], {
        env: {
          ...process.env,
          REPAIR_ROLE: role,
          REPAIR_ROLE_IDENTITY: identity,
          REPAIR_HEAD_SHA: headSha,
          REPAIR_PATCH_DIGEST: patchDigest,
          REPAIR_ENGINEER_EVIDENCE: engineerPath,
          REPAIR_ROLE_OUTPUT: output,
        },
      });
    }
    expect(JSON.parse(await readFile(reviewPath, 'utf8'))).toMatchObject({ role: 'reviewer', repairId, attempt: 1, headSha, patchDigest, verdict: 'passed' });
    expect(JSON.parse(await readFile(qaPath, 'utf8'))).toMatchObject({ role: 'qa', repairId, attempt: 1, headSha, patchDigest, verdict: 'passed' });

    let acknowledged: unknown = null;
    const server = createServer((request, response) => {
      if (request.method === 'GET' && request.url === '/repos/forwauzz/geopulse/pulls/7') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ state: 'open', head: { sha: headSha }, base: { sha: baseSha } }));
        return;
      }
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        expect(request.url).toBe('/v1/scopes/ack');
        expect(request.headers.authorization).toBe('Bearer test-token');
        acknowledged = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"ok":true}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server did not bind');
    try {
      const result = await execFileAsync(process.execPath, [gateScript], {
        env: {
          ...process.env,
          REPAIR_ENGINEER_EVIDENCE: engineerPath,
          REPAIR_REVIEW_VERDICT: reviewPath,
          REPAIR_QA_VERDICT: qaPath,
          REPAIR_AGENT_URL: `http://127.0.0.1:${address.port}`,
          REPAIR_AGENT_API_TOKEN: 'test-token',
          REPAIR_AUTONOMOUS_MERGE_ENABLED: 'false',
          REPAIR_GITHUB_API_URL: `http://127.0.0.1:${address.port}`,
          GITHUB_TOKEN: 'github-test-token',
          GITHUB_REPOSITORY: 'forwauzz/geopulse',
          REPAIR_PR_NUMBER: '7',
        },
      });
      expect(JSON.parse(result.stdout)).toMatchObject({ artifactsValidated: true, scopeAcknowledged: true, mergeAllowed: false, repairId, attempt: 1, headSha, pullRequestNumber: 7 });
      expect(acknowledged).toMatchObject({ repairId, attempt: 1, leaseId: 'github-run-canary-12345', gateDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('fails closed when a role verdict is stale', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'repair-canary-stale-'));
    temporaryDirectories.push(directory);
    const engineerPath = join(directory, 'engineer.json');
    const reviewPath = join(directory, 'review.json');
    const qaPath = join(directory, 'qa.json');
    const artifact = {
      schemaVersion: 1,
      repairId: 'd'.repeat(32),
      auditRunId: 'canary-run-1',
      repositoryProfileId: 'geopulse-canary-v1',
      repository: 'forwauzz/geopulse',
      risk: 'low',
      attempt: 1,
      baseSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      patchDigest: 'c'.repeat(64),
      changedPaths: ['repair-agent/test/portable-repo/public/robots.txt'],
      changedLines: 2,
      authorIdentity: 'github-actions:repair-engineer-shadow',
    };
    const repairEvidence = { leaseId: 'github-run-canary-12345' };
    const unsigned = { schemaVersion: 1, repairEvidence, engineerArtifact: artifact };
    await writeFile(engineerPath, JSON.stringify({ ...unsigned, evidenceDigest: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex') }), 'utf8');
    const stale = { schemaVersion: 1, role: 'reviewer', repairId: artifact.repairId, attempt: 1, headSha: '9'.repeat(40), patchDigest: artifact.patchDigest, identity: 'reviewer', verdict: 'passed', engineerEvidenceDigest: '0'.repeat(64), reasons: [], evidenceDigest: '0'.repeat(64) };
    await writeFile(reviewPath, JSON.stringify(stale), 'utf8');
    await writeFile(qaPath, JSON.stringify({ ...stale, role: 'qa', identity: 'qa' }), 'utf8');
    await expect(execFileAsync(process.execPath, [gateScript], {
      env: { ...process.env, REPAIR_ENGINEER_EVIDENCE: engineerPath, REPAIR_REVIEW_VERDICT: reviewPath, REPAIR_QA_VERDICT: qaPath, REPAIR_AGENT_URL: 'http://127.0.0.1:1', REPAIR_AGENT_API_TOKEN: 'test-token', REPAIR_AUTONOMOUS_MERGE_ENABLED: 'false', GITHUB_TOKEN: 'github-test-token', GITHUB_REPOSITORY: 'forwauzz/geopulse', REPAIR_PR_NUMBER: '7' },
    })).rejects.toThrow();
  });

  it('claims and executes a requeued second attempt with the prior feedback attached', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'repair-canary-retry-'));
    temporaryDirectories.push(directory);
    const targetRoot = join(directory, 'site');
    const outputPath = join(directory, 'retry-evidence.json');
    await mkdir(join(targetRoot, 'public'), { recursive: true });
    const original = 'User-agent: *\nAllow: /\n';
    const finalContent = `${original}Sitemap: https://getgeopulse.com/sitemap.xml\n`;
    await writeFile(join(targetRoot, 'public', 'robots.txt'), original, 'utf8');
    const repairId = 'd'.repeat(32);
    const jobId = 'e'.repeat(32);
    const artifactDigest = 'f'.repeat(64);
    const afterSha256 = createHash('sha256').update(finalContent).digest('hex');
    const contentDigest = createHash('sha256').update(JSON.stringify([{ path: 'public/robots.txt', sha256: afterSha256 }])).digest('hex');
    let submittedRepair: Record<string, any> | null = null;
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
        response.writeHead(200, { 'content-type': 'application/json' });
        if (request.url === '/v1/scopes/claim') {
          expect(body.repairId).toBe(repairId);
          response.end(JSON.stringify({ ok: true, leaseId: body.leaseId, scope: {
            schemaVersion: 1, attempt: 2, feedback: ['QA job failure'], producer: 'github-shadow-canary', repairId,
            auditRunId: 'canary-original', findingId: 'canary-original:robots-sitemap', repositoryProfileId: 'geopulse-canary-v1',
            repository: 'forwauzz/geopulse', defaultBranch: 'main', siteOrigin: 'https://getgeopulse.com',
            sourceFinding: { checkId: 'robots-sitemap', targetUrl: 'https://getgeopulse.com/', finding: 'Missing sitemap directive.', confidence: 'high', risk: 'low', reportedAt: '2026-08-19T16:00:00.000Z' },
            instruction: { skillId: 'ensure-robots-sitemap', path: 'public/robots.txt', sitemapUrl: 'https://getgeopulse.com/sitemap.xml' },
            changeBudget: { maxFiles: 1, maxChangedLines: 8 },
            issue: { title: '[REPAIR] robots sitemap', owner: 'engineer', reviewer: 'reviewer', retryPolicy: 'maximum_three_sha_bound_attempts', nextAction: 'retry', dueAt: '2026-08-19T20:00:00.000Z', postcondition: 'directive exists once' },
          } }));
        } else if (request.url === '/v1/repairs') {
          submittedRepair = body;
          response.end(JSON.stringify({ accepted: true, duplicate: false, jobId, workflowId: 'workflow-2' }));
        } else if (request.url === '/v1/status') {
          response.end(JSON.stringify({ recent: [{ jobId, outcome: 'verified_shadow', evidenceDigest: artifactDigest }] }));
        } else if (request.url === `/v1/artifacts/${jobId}`) {
          response.end(JSON.stringify({ ok: true, artifact: {
            evidenceDigest: artifactDigest, contentDigest, attempt: 2, feedback: ['QA job failure'], finalFiles: { 'public/robots.txt': finalContent },
            changedFiles: [{ path: 'public/robots.txt', afterSha256 }],
          } }));
        } else {
          response.statusCode = 404;
          response.end('{}');
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server did not bind');
    try {
      await execFileAsync(process.execPath, [canaryScript], { env: {
        ...process.env,
        REPAIR_AGENT_URL: `http://127.0.0.1:${address.port}`,
        REPAIR_AGENT_API_TOKEN: 'test-token',
        REPAIR_CANARY_ID: 'retry-run-2',
        REPAIR_CANARY_ROOT: targetRoot,
        REPAIR_CANARY_OUTPUT: outputPath,
        REPAIR_EXISTING_REPAIR_ID: repairId,
      } });
      expect(submittedRepair).toMatchObject({ idempotencyKey: `${repairId}:attempt:2`, attempt: 2, feedback: ['QA job failure'], finding: { checkId: 'robots-sitemap', finding: 'Missing sitemap directive.' } });
      expect(await readFile(join(targetRoot, 'public', 'robots.txt'), 'utf8')).toBe(finalContent);
      expect(JSON.parse(await readFile(outputPath, 'utf8'))).toMatchObject({ repairId, attempt: 2, feedback: ['QA job failure'] });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('claims a pending engineer failure and returns it to the exact attempt', async () => {
    const repairId = 'a'.repeat(32);
    let feedbackBody: Record<string, any> | null = null;
    let claimBody: Record<string, any> | null = null;
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' });
        if (request.url === '/v1/status') {
          response.end(JSON.stringify({ pendingScopes: [{
            state: 'pending', leaseId: null,
            scope: { repairId, auditRunId: 'canary-failed-12345', attempt: 1 },
          }] }));
          return;
        }
        if (request.url === '/v1/scopes/claim') {
          claimBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          response.end(JSON.stringify({ ok: true, leaseId: 'github-recovery-failed-12345', scope: { repairId, auditRunId: 'canary-failed-12345', attempt: 1 } }));
          return;
        }
        if (request.url === '/v1/scopes/feedback') {
          feedbackBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          response.end(JSON.stringify({ ok: true, requeued: true, nextAttempt: 2, exhausted: false, replayed: false }));
          return;
        }
        response.end('{}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server did not bind');
    try {
      const result = await execFileAsync(process.execPath, [engineerFailureScript], { env: {
        ...process.env,
        REPAIR_AGENT_URL: `http://127.0.0.1:${address.port}`,
        REPAIR_AGENT_API_TOKEN: 'test-token',
        REPAIR_CANARY_ID: 'failed-12345',
        REPAIR_ENGINEER_RESULT: 'failure',
      } });
      expect(JSON.parse(result.stdout)).toMatchObject({ recovered: true, repairId, attempt: 1, requeued: true, nextAttempt: 2 });
      expect(claimBody).toEqual({ repairId, leaseId: 'github-recovery-failed-12345' });
      expect(feedbackBody).toMatchObject({ repairId, attempt: 1, leaseId: 'github-recovery-failed-12345', reasons: ['engineer job failure'], feedbackDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
