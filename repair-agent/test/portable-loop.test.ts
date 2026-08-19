import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuditEnvelope } from '../src/loop/contracts';
import { selectAuditFinding } from '../src/loop/audit-intake';
import { sha256 } from '../src/loop/canonical';
import { evaluateDeploymentQa } from '../src/loop/deployment-qa';
import { parseGitHubCheckRunObservation, parseGitHubRequiredCheckObservation } from '../src/loop/github-observations';
import { evaluateMergeGate } from '../src/loop/merge-gate';
import { repositoryProfileDigest } from '../src/loop/profile-registry';
import { buildEngineerArtifact } from '../src/loop/repository-adapter';
import { PORTABLE_FIXTURE_PROFILE } from '../src/loop/repository-profile';
import { scopeRepair } from '../src/loop/scoper';
import { qaEngineerArtifact, reviewEngineerArtifact } from '../src/loop/verdicts';

const execFile = promisify(execFileCallback);
const runnerPath = fileURLToPath(new URL('../container/repair-runner.mjs', import.meta.url));
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function run(command: string, args: string[], cwd: string): Promise<string> {
  const result = await execFile(command, args, { cwd, windowsHide: true });
  return result.stdout.trim();
}

describe('disposable repository adapter canary', () => {
  it('proves audit to scoped patch, authenticated review/QA, merge dry run, and deployment QA in a second Git repository', async () => {
    const root = await mkdtemp(join(tmpdir(), 'portable-repair-loop-'));
    temporaryRoots.push(root);
    await mkdir(join(root, 'public'), { recursive: true });
    await mkdir(join(root, 'test'), { recursive: true });
    await writeFile(join(root, 'public', 'robots.txt'), 'User-agent: *\nAllow: /\n', 'utf8');
    await writeFile(join(root, 'package.json'), JSON.stringify({ private: true, scripts: { test: 'node --test' } }), 'utf8');
    await writeFile(join(root, 'test', 'robots.test.mjs'), "import assert from 'node:assert/strict';\nimport { readFile } from 'node:fs/promises';\nimport test from 'node:test';\ntest('robots declares sitemap', async () => assert.equal((await readFile('public/robots.txt', 'utf8')).includes('Sitemap: https://portable.example/sitemap.xml'), true));\n", 'utf8');

    await run('git', ['init', '-b', 'main'], root);
    await run('git', ['config', 'user.email', 'repair-fixture@example.invalid'], root);
    await run('git', ['config', 'user.name', 'Repair Fixture'], root);
    await run('git', ['add', '.'], root);
    await run('git', ['commit', '-m', 'fixture baseline'], root);
    const baseSha = await run('git', ['rev-parse', 'HEAD'], root);
    await run('git', ['switch', '-c', 'repair/robots-sitemap'], root);

    const profileDigest = await repositoryProfileDigest(PORTABLE_FIXTURE_PROFILE);
    const generatedAt = '2026-08-19T15:55:00.000Z';
    const audit: AuditEnvelope = {
      schemaVersion: 1,
      producer: 'github-shadow-canary',
      auditRunId: 'portable-audit-1',
      repositoryProfileId: PORTABLE_FIXTURE_PROFILE.id,
      targetUrl: 'https://portable.example/',
      generatedAt,
      score: 80,
      letterGrade: 'B',
      checkCatalogVersion: 'portable-v1',
      findings: [{
        findingId: 'portable-audit-1:robots', checkId: 'robots-sitemap', status: 'FAIL', confidence: 'high', risk: 'low', weight: 10,
        category: 'technical', finding: 'robots.txt lacks the canonical sitemap directive.', fix: 'Add it exactly once.',
        repairHint: { instruction: { skillId: 'ensure-robots-sitemap', path: 'public/robots.txt', sitemapUrl: 'https://portable.example/sitemap.xml' } },
      }],
    };
    const decision = selectAuditFinding({ envelope: audit, profile: PORTABLE_FIXTURE_PROFILE, seenAuditRunIds: new Set(), nowMs: Date.parse('2026-08-19T16:00:00.000Z') });
    expect(decision.accepted).toBe(true);
    if (!decision.accepted) return;
    const scope = await scopeRepair({ envelope: audit, finding: decision.finding, profile: PORTABLE_FIXTURE_PROFILE, profileDigest, nowMs: Date.parse('2026-08-19T16:00:00.000Z') });

    const request = {
      schemaVersion: 1 as const, mode: 'shadow' as const, repository: scope.repository, siteOrigin: scope.siteOrigin,
      idempotencyKey: `${scope.repairId}:attempt:1`, attempt: 1, feedback: [],
      finding: { findingId: scope.findingId, sourceAuditId: scope.auditRunId, ...scope.sourceFinding },
      instruction: scope.instruction, changeBudget: scope.changeBudget,
      fixture: { files: { 'public/robots.txt': await readFile(join(root, 'public', 'robots.txt'), 'utf8') } },
    };
    const jobPath = join(root, 'repair-job.json');
    const resultPath = join(root, 'repair-result.json');
    await writeFile(jobPath, JSON.stringify({ schemaVersion: 1, jobId: 'portable-job-1', repoRoot: root, request }), 'utf8');
    await run(process.execPath, [runnerPath, jobPath, resultPath], root);
    const runnerResult = JSON.parse(await readFile(resultPath, 'utf8')) as { ok: boolean; finalFiles: Record<string, string>; changedFiles: { path: string; changedLines: number }[] };
    expect(runnerResult.ok).toBe(true);
    await writeFile(join(root, 'public', 'robots.txt'), runnerResult.finalFiles['public/robots.txt']!, 'utf8');
    await run('git', ['add', 'public/robots.txt'], root);
    await run('git', ['commit', '-m', 'repair robots sitemap'], root);
    const headSha = await run('git', ['rev-parse', 'HEAD'], root);
    const patch = await run('git', ['diff', '--binary', '--full-index', baseSha, headSha], root);
    const patchDigest = createHash('sha256').update(patch).digest('hex');
    const changedLines = runnerResult.changedFiles.reduce((sum, file) => sum + file.changedLines, 0);
    const engineerEvidenceDigest = await sha256({ scope, baseSha, headSha, patchDigest, changedLines });
    const artifact = await buildEngineerArtifact({
      scope,
      profile: PORTABLE_FIXTURE_PROFILE,
      profileDigest,
      engineerEvidenceDigest,
      observation: {
        provider: 'github', repository: PORTABLE_FIXTURE_PROFILE.repository, baseSha, headSha, patchDigest,
        changedPaths: ['public/robots.txt'], changedLines,
        author: { appSlug: 'portable-repair-engineer', appId: 91000, runId: 100 }, observedAt: '2026-08-19T15:57:00.000Z',
      },
    });

    const reviewer = await reviewEngineerArtifact({
      artifact, profile: PORTABLE_FIXTURE_PROFILE, profileDigest, observedPatchDigest: patchDigest,
      observation: { provider: 'github', role: 'reviewer', repository: PORTABLE_FIXTURE_PROFILE.repository, appSlug: 'portable-repair-reviewer', appId: 91001, checkRunId: 101, headSha, conclusion: 'success', observedAt: '2026-08-19T15:58:00.000Z' },
    });
    await run(process.execPath, ['--test'], root);
    const qaExitCode = 0;
    const qa = await qaEngineerArtifact({
      artifact, profile: PORTABLE_FIXTURE_PROFILE, profileDigest, observedPatchDigest: patchDigest,
      observation: { provider: 'github', role: 'qa', repository: PORTABLE_FIXTURE_PROFILE.repository, appSlug: 'portable-repair-qa', appId: 91002, checkRunId: 102, headSha, conclusion: qaExitCode === 0 ? 'success' : 'failure', observedAt: '2026-08-19T15:59:00.000Z' },
      commandResults: [{ argv: ['node', '--test'], exitCode: qaExitCode }], postconditionPassed: runnerResult.finalFiles['public/robots.txt']?.includes('Sitemap: https://portable.example/sitemap.xml') === true,
    });
    expect(reviewer.verdict).toBe('passed');
    expect(qa).toMatchObject({ verdict: 'passed', reasons: [] });

    const merge = await evaluateMergeGate({
      enabled: true, killSwitch: false, risk: 'low', artifact, reviewer, qa,
      checkRuns: PORTABLE_FIXTURE_PROFILE.requiredChecks.map((check, index) => parseGitHubRequiredCheckObservation({
        raw: { id: 200 + index, name: check.checkName, head_sha: headSha, conclusion: 'success', app: { slug: check.appSlug, id: check.appId } },
        repository: PORTABLE_FIXTURE_PROFILE.repository, observedAt: '2026-08-19T15:59:00.000Z',
      })),
      profile: PORTABLE_FIXTURE_PROFILE, profileDigest,
      mergeController: parseGitHubCheckRunObservation({
        raw: { id: 103, head_sha: headSha, conclusion: 'success', app: { slug: 'portable-repair-merge', id: 91003 } },
        role: 'merge-controller', repository: PORTABLE_FIXTURE_PROFILE.repository, observedAt: '2026-08-19T15:59:30.000Z',
      }),
      pullRequest: { repository: PORTABLE_FIXTURE_PROFILE.repository, number: 8, state: 'open', baseRef: 'main', baseSha, headSha, mergeable: true, linkedIssueNumbers: [7], observedAt: '2026-08-19T15:59:30.000Z' },
      issueNumber: 7, evaluatedAt: '2026-08-19T16:00:00.000Z', attemptsUsed: 1,
    });
    expect(merge).toEqual({ allowed: true, reasons: [] });

    const deployment = await evaluateDeploymentQa({
      profile: PORTABLE_FIXTURE_PROFILE, profileDigest, repairId: scope.repairId, expectedSourceSha: headSha,
      expectedDeploymentId: 'portable-deploy-1', expectedVersionId: 'portable-version-1',
      evaluatedAt: '2026-08-19T16:02:00.000Z',
      observation: { provider: 'fixture', deploymentId: 'portable-deploy-1', versionId: 'portable-version-1', sourceSha: headSha, environment: 'production', observedAt: '2026-08-19T16:01:00.000Z' },
      probes: PORTABLE_FIXTURE_PROFILE.repositoryAdapter.productionSmokeUrls.map((url) => ({ url, finalUrl: url, status: 200, bodyDigest: createHash('sha256').update(url).digest('hex') })),
    });
    expect(deployment.verdict).toBe('passed');
  });
});
