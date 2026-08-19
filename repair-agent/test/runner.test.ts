import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { RepairRequest, RunnerResult } from '../src/contracts';
import { evaluateRepair } from '../src/evaluator';
import { admitRepair, type RepairPolicyConfig } from '../src/policy';
import { appendAttempt, beginRepair, completeRepair, initialRepairState } from '../src/state';
import { validRepairRequest } from './fixtures';

const runnerPath = fileURLToPath(new URL('../container/repair-runner.mjs', import.meta.url));
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function execute(request: RepairRequest): Promise<{ exitCode: number; result: RunnerResult }> {
  const root = await mkdtemp(join(tmpdir(), 'repair-runner-test-'));
  temporaryRoots.push(root);
  const repoRoot = join(root, 'repo');
  await mkdir(repoRoot, { recursive: true });
  for (const [path, content] of Object.entries(request.fixture.files)) {
    const absolute = join(repoRoot, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, 'utf8');
  }
  const input = join(root, 'job.json');
  const output = join(root, 'result.json');
  await writeFile(input, JSON.stringify({ schemaVersion: 1, jobId: 'job-1', repoRoot, request }), 'utf8');

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath, input, output], { stdio: 'pipe' });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === null) reject(new Error(`runner terminated without an exit code: ${stderr}`));
      else resolve(code);
    });
  });
  const result = JSON.parse(await readFile(output, 'utf8')) as RunnerResult;
  return { exitCode, result };
}

describe('deterministic container repair runner', () => {
  it('completes the full shadow admission repair evaluation and closure loop', async () => {
    const request = validRepairRequest();
    const policy: RepairPolicyConfig = {
      mode: 'shadow',
      killSwitch: false,
      productionMutationsEnabled: false,
      repositoryAllowlist: ['forwauzz/geopulse'],
      originAllowlist: ['https://getgeopulse.com'],
      maxAttempts: 3,
    };
    expect(admitRepair(request, policy).admitted).toBe(true);
    let state = beginRepair(
      initialRepairState(),
      { jobId: 'job-1', idempotencyKey: request.idempotencyKey, findingId: request.finding.findingId },
      '2026-08-19T04:00:00.000Z'
    );
    const { result } = await execute(request);
    const evaluation = await evaluateRepair('job-1', request, result);
    expect(evaluation.passed).toBe(true);
    state = appendAttempt(
      state,
      'job-1',
      {
        attempt: 1,
        recordedAt: '2026-08-19T04:00:01.000Z',
        outcome: 'passed',
        evidenceDigest: evaluation.evidenceDigest,
        reasons: [],
      },
      '2026-08-19T04:00:01.000Z'
    );
    state = completeRepair(
      state,
      'job-1',
      'verified_shadow',
      evaluation,
      [],
      '2026-08-19T04:00:02.000Z'
    );
    expect(state.productionMutationsEnabled).toBe(false);
    expect(state.active).toBeNull();
    expect(state.recent[0]?.outcome).toBe('verified_shadow');
  });

  it('replaces one exact broken internal link', async () => {
    const { exitCode, result } = await execute(validRepairRequest());
    expect(exitCode).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.finalFiles['app/resources/page.tsx']).toContain('/articles/new-guide');
    expect(result.changedFiles).toHaveLength(1);
  });

  it('creates a deterministic robots sitemap directive', async () => {
    const request = validRepairRequest();
    request.finding.checkId = 'robots-txt';
    request.finding.findingId = 'robots-1';
    request.instruction = {
      skillId: 'ensure-robots-sitemap',
      path: 'public/robots.txt',
      sitemapUrl: 'https://getgeopulse.com/sitemap.xml',
    };
    request.changeBudget = { maxFiles: 1, maxChangedLines: 8 };
    request.fixture = { files: { 'app/page.tsx': '<main>Home</main>\n' } };
    const { result } = await execute(request);
    expect(result.ok).toBe(true);
    expect(result.finalFiles['public/robots.txt']).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://getgeopulse.com/sitemap.xml\n'
    );
  });

  it('removes one exact sitemap URL block', async () => {
    const request = validRepairRequest();
    request.finding.checkId = 'sitemap-url-safety';
    request.finding.findingId = 'sitemap-1';
    request.instruction = {
      skillId: 'remove-sitemap-url',
      path: 'public/sitemap.xml',
      url: 'https://getgeopulse.com/deleted',
    };
    request.changeBudget = { maxFiles: 1, maxChangedLines: 8 };
    request.fixture = {
      files: {
        'public/sitemap.xml':
          '<urlset>\n<url><loc>https://getgeopulse.com/kept</loc></url>\n<url><loc>https://getgeopulse.com/deleted</loc></url>\n</urlset>\n',
      },
    };
    const { result } = await execute(request);
    expect(result.ok).toBe(true);
    expect(result.finalFiles['public/sitemap.xml']).not.toContain('/deleted');
    expect(result.finalFiles['public/sitemap.xml']).toContain('/kept');
  });

  it('fails closed on ambiguous repeated replacements', async () => {
    const request = validRepairRequest();
    request.fixture.files['app/resources/page.tsx'] =
      '<a href="/articles/old-guide">One</a><a href="/articles/old-guide">Two</a>\n';
    const { exitCode, result } = await execute(request);
    expect(exitCode).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe('broken link must occur exactly once');
  });
});
