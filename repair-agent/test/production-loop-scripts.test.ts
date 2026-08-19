import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { RequestListener } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { sha256 } from '../src/loop/canonical';

const execFileAsync = promisify(execFile);
const productionRepairScript = new URL('../scripts/run-production-repair.mjs', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const finalizerScript = new URL('../src/cli/finalize-production-repair.ts', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const recoveryScript = new URL('../src/cli/recover-production-lifecycle.ts', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const rollbackScript = new URL('../scripts/run-production-rollback.sh', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const tsxCli = new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function listen(handler: RequestListener): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not bind');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

describe('production repair orchestration scripts', () => {
  it('uses a distinct idempotent rollback lineage for every bounded attempt', async () => {
    const source = await readFile(rollbackScript, 'utf8');
    expect(source).toContain('BRANCH="repair-agent/revert-$REPAIR_ID-attempt-$ATTEMPT"');
    const branch = (attempt: number) => `repair-agent/revert-${'a'.repeat(32)}-attempt-${attempt}`;
    expect(new Set([branch(1), branch(2), branch(3)]).size).toBe(3);
    expect(source).toContain('gh pr list --repo "$GITHUB_REPOSITORY" --state all');
    expect(source).toContain('worktree add --detach "$ROLLBACK_WORKTREE" "$MERGE_SHA"');
    expect(source).toContain('CURRENT_MAIN="$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main")"');
    expect(source).toContain('test "$(jq -r \'.parents[0].sha\' <<<"$ROLLBACK_COMMIT")" = "$MERGE_SHA"');
    expect(source).toContain('test "$ROLLBACK_TREE" = "$ORIGINAL_TREE"');
  });
  it('reports a healthy no-op only with fresh canonical audit intake evidence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'repair-production-noop-'));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, 'repair.json');
    let stale = false;
    const server = await listen((request, response): void => {
      response.writeHead(200, { 'content-type': 'application/json' });
      if (request.url === '/v1/scopes/claim') {
        response.end(JSON.stringify({ scope: null }));
        return;
      }
      if (request.url === '/v1/status') {
        response.end(JSON.stringify({
          pendingScopes: [],
          auditHistory: [{
            producer: 'canonical-cloudflare-scheduler', outcome: 'unsupported', auditRunId: 'audit-fresh',
            recordedAt: stale ? '2026-08-01T00:00:00.000Z' : new Date().toISOString(),
          }],
        }));
        return;
      }
      response.writeHead(404).end('{}');
    });
    const env = {
      ...process.env,
      REPAIR_AGENT_URL: server.url,
      REPAIR_AGENT_API_TOKEN: 'test-token',
      REPAIR_RUN_ID: 'production-noop-123456',
      REPAIR_OUTPUT: outputPath,
      REPAIR_REPOSITORY_ROOT: directory,
    };
    try {
      await expect(execFileAsync(process.execPath, [productionRepairScript], { env })).resolves.toMatchObject({ stdout: expect.stringContaining('"queued":false') });
      expect(JSON.parse(await readFile(outputPath, 'utf8'))).toMatchObject({ queued: false, auditRunId: 'audit-fresh' });
      stale = true;
      await expect(execFileAsync(process.execPath, [productionRepairScript], { env })).rejects.toBeTruthy();
    } finally {
      await server.close();
    }
  });

  it('reconciles merged state, acknowledges only after deployment QA, then closes the issue', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'repair-production-finalize-'));
    temporaryDirectories.push(directory);
    const mergePath = join(directory, 'merge.json');
    const deploymentPath = join(directory, 'deployment.json');
    const outputPath = join(directory, 'finalize.json');
    const repairId = 'a'.repeat(32);
    const mergeSha = 'b'.repeat(40);
    const unsignedVerdict = {
      schemaVersion: 1 as const,
      repositoryProfileId: 'geopulse-v1',
      repositoryProfileDigest: 'c'.repeat(64),
      repairId,
      sourceSha: mergeSha,
      deploymentId: 'github-check-1',
      versionId: 'version-1',
      environment: 'production' as const,
      verdict: 'passed' as const,
      probeEvidenceDigest: 'd'.repeat(64),
      reasons: [],
    };
    const verdict = { ...unsignedVerdict, evidenceDigest: await sha256(unsignedVerdict) };
    await writeFile(mergePath, JSON.stringify({ schemaVersion: 1, merged: true, repairId, attempt: 1, issueNumber: 7, mergeSha, leaseId: 'github-production-123456', gateDigest: 'e'.repeat(64) }), 'utf8');
    await writeFile(deploymentPath, JSON.stringify({ verdict, observation: { deploymentId: 'github-check-1', versionId: 'version-1', sourceSha: mergeSha } }), 'utf8');
    const calls: string[] = [];
    const server = await listen((request, response): void => {
      calls.push(`${request.method} ${request.url}`);
      request.resume();
      response.writeHead(200, { 'content-type': 'application/json' });
      if (request.url === '/v1/scopes/merged') {
        response.end(JSON.stringify({ ok: true, replayed: true }));
        return;
      }
      if (request.url === '/v1/scopes/ack') {
        response.end(JSON.stringify({ ok: true, replayed: false }));
        return;
      }
      if (request.url === '/repos/forwauzz/geopulse/issues/7') {
        response.end(JSON.stringify({ state: 'closed' }));
        return;
      }
      response.writeHead(404).end('{}');
    });
    try {
      await execFileAsync(process.execPath, [tsxCli, finalizerScript], { env: {
        ...process.env,
        GITHUB_REPOSITORY: 'forwauzz/geopulse',
        GITHUB_API_URL: server.url,
        REPAIR_MERGE_APP_TOKEN: 'merge-token',
        REPAIR_AGENT_URL: server.url,
        REPAIR_AGENT_API_TOKEN: 'repair-token',
        REPAIR_MERGE_EVIDENCE: mergePath,
        REPAIR_DEPLOYMENT_QA_EVIDENCE: deploymentPath,
        REPAIR_FINALIZE_OUTPUT: outputPath,
      } });
      expect(calls).toEqual([
        'POST /v1/scopes/merged',
        'POST /v1/scopes/ack',
        'PATCH /repos/forwauzz/geopulse/issues/7',
      ]);
      expect(JSON.parse(await readFile(outputPath, 'utf8'))).toMatchObject({ finalized: true, repairId, mergeSha });
    } finally {
      await server.close();
    }
  });

  it('recovers a GitHub merge committed after durable intent but before local evidence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'repair-production-recovery-'));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, 'recovery.json');
    const mergePath = join(directory, 'merge.json');
    const repairId = 'a'.repeat(32);
    const headSha = 'b'.repeat(40);
    const mergeSha = 'c'.repeat(40);
    const calls: string[] = [];
    const server = await listen((request, response): void => {
      calls.push(`${request.method} ${request.url}`);
      request.resume();
      response.writeHead(200, { 'content-type': 'application/json' });
      if (request.url === '/v1/status') {
        response.end(JSON.stringify({ pendingScopes: [{
          state: 'merge_pending', leaseId: 'github-production-crash-1', leaseExpiresAt: null,
          scope: { repairId, attempt: 1, repository: 'forwauzz/geopulse', repositoryProfileId: 'geopulse-v1' },
          mergeIntent: { intentDigest: 'd'.repeat(64), pullRequestNumber: 8, issueNumber: 7, baseSha: 'e'.repeat(40), headSha, patchDigest: 'f'.repeat(64), controllerCheckRunId: 10, requiredCheckRunIds: [11, 12, 13] },
        }] }));
        return;
      }
      if (request.url === '/repos/forwauzz/geopulse/pulls/8') {
        response.end(JSON.stringify({ merged: true, merge_commit_sha: mergeSha, head: { sha: headSha }, base: { ref: 'main', sha: 'e'.repeat(40) } }));
        return;
      }
      if (request.url === `/repos/forwauzz/geopulse/commits/${mergeSha}`) {
        response.end(JSON.stringify({ sha: mergeSha, parents: [{ sha: 'e'.repeat(40) }] }));
        return;
      }
      if (request.url === '/v1/scopes/merged') {
        response.end(JSON.stringify({ ok: true, replayed: false }));
        return;
      }
      response.statusCode = 404;
      response.end('{}');
    });
    try {
      await execFileAsync(process.execPath, [tsxCli, recoveryScript], { env: {
        ...process.env,
        GITHUB_REPOSITORY: 'forwauzz/geopulse',
        GITHUB_API_URL: server.url,
        REPAIR_MERGE_APP_TOKEN: 'merge-token',
        REPAIR_AGENT_URL: server.url,
        REPAIR_AGENT_API_TOKEN: 'repair-token',
        REPAIR_RECOVERY_OUTPUT: outputPath,
        REPAIR_MERGE_EVIDENCE: mergePath,
      } });
      expect(calls).toEqual([
        'GET /v1/status',
        'GET /repos/forwauzz/geopulse/pulls/8',
        `GET /repos/forwauzz/geopulse/commits/${mergeSha}`,
        'POST /v1/scopes/merged',
      ]);
      expect(JSON.parse(await readFile(outputPath, 'utf8'))).toMatchObject({ action: 'production_qa', scope: { repairId }, mergeSha });
      expect(JSON.parse(await readFile(mergePath, 'utf8'))).toMatchObject({ merged: true, recovered: true, repairId, headSha, mergeSha, leaseId: 'github-production-crash-1' });
    } finally {
      await server.close();
    }
  });
});
