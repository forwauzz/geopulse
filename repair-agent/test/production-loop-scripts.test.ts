import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { RequestListener } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { sha256 } from '../src/loop/canonical';
import type { EngineerArtifact } from '../src/loop/contracts';
import { parseGitHubCheckRunObservation } from '../src/loop/github-observations';
import { repositoryProfileDigest } from '../src/loop/profile-registry';
import { GEOPULSE_PROFILE } from '../src/loop/repository-profile';
import { resolveQaCommandPreset } from '../src/loop/command-presets';
import { qaEngineerArtifact, reviewEngineerArtifact } from '../src/loop/verdicts';

const execFileAsync = promisify(execFile);
const productionRepairScript = new URL('../scripts/run-production-repair.mjs', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const finalizerScript = new URL('../src/cli/finalize-production-repair.ts', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const recoveryScript = new URL('../src/cli/recover-production-lifecycle.ts', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const mergeScript = new URL('../src/cli/run-production-merge.ts', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const deploymentQaScript = new URL('../src/cli/run-production-deployment-qa.ts', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
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

  it('commits merge intent then aborts one bounded attempt when main advances before PUT', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'repair-production-base-drift-'));
    temporaryDirectories.push(directory);
    const engineerPath = join(directory, 'engineer.json');
    const reviewerPath = join(directory, 'reviewer.json');
    const qaPath = join(directory, 'qa.json');
    const outputPath = join(directory, 'merge.json');
    const repairId = '1'.repeat(32);
    const baseSha = '2'.repeat(40);
    const headSha = '3'.repeat(40);
    const profileDigest = await repositoryProfileDigest(GEOPULSE_PROFILE);
    const artifact: EngineerArtifact = {
      schemaVersion: 1, contractMode: 'authenticated-github-v1', repairId, auditRunId: 'audit-drift-1',
      repositoryProfileId: GEOPULSE_PROFILE.id, repositoryProfileDigest: profileDigest,
      repository: GEOPULSE_PROFILE.repository, risk: 'low', attempt: 1, baseSha, headSha,
      patchDigest: '4'.repeat(64), changedPaths: ['app/robots.ts'], changedLines: 5,
      authorIdentity: 'github-app:15368:github-actions:run:99', authorIssuer: { provider: 'github', appSlug: 'github-actions', appId: 15368 },
      engineerEvidenceDigest: '5'.repeat(64),
    };
    const observedAt = new Date().toISOString();
    const reviewerObservation = parseGitHubCheckRunObservation({ raw: { id: 501, head_sha: headSha, conclusion: 'success', app: { slug: 'geo-pulse-repair-reviewer', id: 4652371 } }, role: 'reviewer', repository: GEOPULSE_PROFILE.repository, observedAt });
    const qaObservation = parseGitHubCheckRunObservation({ raw: { id: 502, head_sha: headSha, conclusion: 'success', app: { slug: 'geo-pulse-repair-qa', id: 4652496 } }, role: 'qa', repository: GEOPULSE_PROFILE.repository, observedAt });
    const reviewer = await reviewEngineerArtifact({ artifact, profile: GEOPULSE_PROFILE, profileDigest, observation: reviewerObservation, observedPatchDigest: artifact.patchDigest });
    const preset = resolveQaCommandPreset(GEOPULSE_PROFILE.qaCommandPresetId);
    const commandResults = [...preset.focused, ...preset.affected, ...preset.typeCheck, ...preset.build, ...preset.browser].map((argv) => ({ argv, exitCode: 0 }));
    const qa = await qaEngineerArtifact({ artifact, profile: GEOPULSE_PROFILE, profileDigest, observation: qaObservation, observedPatchDigest: artifact.patchDigest, commandResults, postconditionPassed: true });
    const unsignedEnvelope = { schemaVersion: 1 as const, contractMode: 'authenticated-github-v1' as const, repairEvidence: { leaseId: 'github-production-drift-1' }, engineerArtifact: artifact };
    await writeFile(engineerPath, JSON.stringify({ ...unsignedEnvelope, evidenceDigest: await sha256(unsignedEnvelope) }), 'utf8');
    await writeFile(reviewerPath, JSON.stringify(reviewer), 'utf8');
    await writeFile(qaPath, JSON.stringify(qa), 'utf8');

    let pullReads = 0;
    const coordinatorCalls: string[] = [];
    const checkRuns = new Map<number, Record<string, unknown>>([
      [501, { id: 501, name: 'repair-review', head_sha: headSha, conclusion: 'success', app: { slug: 'geo-pulse-repair-reviewer', id: 4652371 } }],
      [502, { id: 502, name: 'repair-qa', head_sha: headSha, conclusion: 'success', app: { slug: 'geo-pulse-repair-qa', id: 4652496 } }],
      [503, { id: 503, name: 'verify', head_sha: headSha, conclusion: 'success', app: { slug: 'github-actions', id: 15368 } }],
      [600, { id: 600, name: 'repair-merge-controller', head_sha: headSha, conclusion: null, app: { slug: 'geo-pulse-repair-merge', id: 4652526 } }],
    ]);
    const server = await listen((request, response): void => {
      response.writeHead(200, { 'content-type': 'application/json' });
      const url = request.url ?? '';
      if (url === '/health') { response.end(JSON.stringify({ ok: true, mode: 'shadow', productionMutationsEnabled: false, killSwitch: false })); return; }
      if (url.endsWith('/actions/variables/REPAIR_LOOP_ENABLED')) { response.end(JSON.stringify({ value: 'true' })); return; }
      if (url.endsWith('/check-runs') && request.method === 'POST') { response.end(JSON.stringify(checkRuns.get(600))); return; }
      const checkId = /\/check-runs\/(\d+)$/.exec(url)?.[1];
      if (checkId) { response.end(JSON.stringify(checkRuns.get(Number(checkId)))); return; }
      if (url.includes(`/commits/${headSha}/check-runs`)) { response.end(JSON.stringify({ check_runs: [checkRuns.get(503)] })); return; }
      if (url.endsWith('/pulls/8')) {
        pullReads += 1;
        const drifted = pullReads >= 3;
        response.end(JSON.stringify({ number: 8, state: 'open', merged: false, mergeable: true, body: 'Tracks #7. Automated bounded repair.', base: { ref: 'main', sha: drifted ? '9'.repeat(40) : baseSha }, head: { sha: headSha } }));
        return;
      }
      if (url.endsWith('/issues/7')) { response.end(JSON.stringify({ number: 7, state: 'open', body: `Automated low-risk repair lineage \`${repairId}\`.` })); return; }
      if (url.endsWith('/git/ref/heads/main')) { response.end(JSON.stringify({ object: { sha: '9'.repeat(40) } })); return; }
      if (url === '/v1/scopes/merge-intent' || url === '/v1/scopes/merge-abort') {
        coordinatorCalls.push(url);
        request.resume();
        response.end(JSON.stringify({ ok: true, requeued: url.endsWith('merge-abort') }));
        return;
      }
      response.statusCode = 404;
      response.end('{}');
    });
    try {
      await expect(execFileAsync(process.execPath, [tsxCli, mergeScript], { env: {
        ...process.env, GITHUB_REPOSITORY: 'forwauzz/geopulse', GITHUB_API_URL: server.url,
        REPAIR_MERGE_APP_TOKEN: 'merge-token', REPAIR_AGENT_URL: server.url, REPAIR_AGENT_API_TOKEN: 'repair-token',
        REPAIR_ENGINEER_EVIDENCE: engineerPath, REPAIR_REVIEW_VERDICT: reviewerPath, REPAIR_QA_VERDICT: qaPath,
        REPAIR_MERGE_OUTPUT: outputPath, REPAIR_PR_NUMBER: '8', REPAIR_ISSUE_NUMBER: '7', REPAIR_AUTONOMOUS_MERGE_ENABLED: 'true',
      } })).rejects.toBeTruthy();
      expect(coordinatorCalls).toEqual(['/v1/scopes/merge-intent', '/v1/scopes/merge-abort']);
      expect(JSON.parse(await readFile(outputPath, 'utf8'))).toMatchObject({ merged: false, repairId, reasons: ['pull request base changed after review and before merge'] });
    } finally {
      await server.close();
    }
  });

  it('rejects deployment QA evidence when the actual merge parent differs from the reviewed base', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'repair-production-integrity-'));
    temporaryDirectories.push(directory);
    const mergePath = join(directory, 'merge.json');
    await writeFile(mergePath, JSON.stringify({ schemaVersion: 1, merged: true, repairId: 'a'.repeat(32), attempt: 1, issueNumber: 7, mergeSha: 'b'.repeat(40), leaseId: 'github-production-integrity-1', gateDigest: 'c'.repeat(64), integrityFailure: 'merged commit parent does not match reviewed base' }), 'utf8');
    await expect(execFileAsync(process.execPath, [tsxCli, deploymentQaScript], { env: {
      ...process.env, GITHUB_REPOSITORY: 'forwauzz/geopulse', REPAIR_QA_APP_TOKEN: 'qa-token',
      REPAIR_MERGE_EVIDENCE: mergePath, REPAIR_DEPLOYMENT_QA_OUTPUT: join(directory, 'qa.json'),
    } })).rejects.toMatchObject({ stderr: expect.stringContaining('merge integrity failure requires rollback') });
  });
});
