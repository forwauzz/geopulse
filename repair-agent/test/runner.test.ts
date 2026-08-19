import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
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

  it('adds each approved retrieval agent exactly once to the Next.js robots rules', async () => {
    const request = validRepairRequest();
    request.finding.checkId = 'ai-crawler-access';
    request.finding.findingId = 'retrieval-1';
    request.instruction = {
      skillId: 'allow-ai-retrieval-agents',
      path: 'app/robots.ts',
    };
    request.changeBudget = { maxFiles: 1, maxChangedLines: 10 };
    request.fixture = {
      files: {
        'app/robots.ts': "// decoy: { userAgent: 'OAI-SearchBot', allow: '/' }\nexport default async function robots() {\n  return {\n    rules: [\n      { userAgent: '*', disallow: '/' },\n    ],\n  };\n}\n",
      },
    };

    const { exitCode, result } = await execute(request);

    expect(exitCode).toBe(0);
    expect(result.ok).toBe(true);
    const finalRobots = result.finalFiles['app/robots.ts'];
    if (typeof finalRobots !== 'string') throw new Error('runner returned no app/robots.ts content');
    const executableRobots = finalRobots.replace(/^\s*\/\/.*$/gm, '');
    for (const agent of ['Googlebot', 'Bingbot', 'OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot']) {
      expect(executableRobots.match(new RegExp(`userAgent: '${agent}'`, 'g'))).toHaveLength(1);
    }
    expect((await evaluateRepair('job-1', request, result)).passed).toBe(true);
  });

  it('repairs one exact explicit agent disallow without widening an ambiguous rule', async () => {
    const request = validRepairRequest();
    request.finding.checkId = 'ai-crawler-access';
    request.finding.findingId = 'retrieval-explicit-block';
    request.instruction = { skillId: 'allow-ai-retrieval-agents', path: 'app/robots.ts' };
    request.changeBudget = { maxFiles: 1, maxChangedLines: 10 };
    request.fixture = { files: { 'app/robots.ts': "export default async function robots() {\n  return {\n    rules: [\n      { userAgent: 'OAI-SearchBot', disallow: '/' },\n      { userAgent: '*', disallow: '/' },\n    ],\n  };\n}\n" } };
    const { result } = await execute(request);
    expect(result.ok).toBe(true);
    expect(result.finalFiles['app/robots.ts']).toContain("{ userAgent: 'OAI-SearchBot', allow: '/' }");
    expect(result.finalFiles['app/robots.ts']).not.toContain("{ userAgent: 'OAI-SearchBot', disallow: '/' }");
  });

  it('independently rejects decoy rules outside the returned rules array', async () => {
    const request = validRepairRequest();
    request.finding.checkId = 'ai-crawler-access';
    request.finding.findingId = 'retrieval-decoy';
    request.instruction = { skillId: 'allow-ai-retrieval-agents', path: 'app/robots.ts' };
    request.changeBudget = { maxFiles: 1, maxChangedLines: 10 };
    request.fixture = { files: { 'app/robots.ts': "export default async function robots() {\n  return {\n    rules: [\n      { userAgent: '*', disallow: '/' },\n    ],\n  };\n}\n" } };
    const { result } = await execute(request);
    const blocked = "const decoy = { userAgent: 'Googlebot', allow: '/' };\nexport default async function robots() {\n  return { rules: [{ userAgent: '*', disallow: '/' }] };\n}\n";
    const tampered = structuredClone(result);
    tampered.finalFiles['app/robots.ts'] = blocked;
    tampered.changedFiles[0]!.afterSha256 = createHash('sha256').update(blocked).digest('hex');
    expect(await evaluateRepair('job-1', request, tampered)).toMatchObject({ passed: false, hardGateFailures: expect.arrayContaining(['app/robots.ts does not contain exactly one approved allow rule for Googlebot']) });
  });

  it('fails closed when the returned Next.js robots object has multiple rules arrays', async () => {
    const request = validRepairRequest();
    request.finding.checkId = 'ai-crawler-access';
    request.finding.findingId = 'retrieval-ambiguous';
    request.instruction = { skillId: 'allow-ai-retrieval-agents', path: 'app/robots.ts' };
    request.changeBudget = { maxFiles: 1, maxChangedLines: 10 };
    request.fixture = {
      files: {
        'app/robots.ts': "export default async function robots() {\n  return { rules: [], nested: { rules: [] } };\n}\n",
      },
    };

    const { exitCode, result } = await execute(request);

    expect(exitCode).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe('app/robots.ts must contain exactly one returned rules array');
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
