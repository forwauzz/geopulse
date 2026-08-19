#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const SAFE_RELATIVE_PATH = /^(?![A-Za-z]:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const SENSITIVE_PATH = /(^|\/)(?:\.env(?:\.|$)|secrets?(?:\.|\/|$)|credentials?(?:\.|\/|$)|\.git(?:\/|$))/i;

function safePath(root, relativePath) {
  if (!SAFE_RELATIVE_PATH.test(relativePath) || relativePath.includes('\\') || SENSITIVE_PATH.test(relativePath)) {
    throw new Error(`unsafe path: ${relativePath}`);
  }
  const normalized = normalize(relativePath);
  const absolute = resolve(root, normalized);
  const rootPrefix = `${resolve(root)}${sep}`;
  if (!absolute.startsWith(rootPrefix)) throw new Error(`path escaped workspace: ${relativePath}`);
  return absolute;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function countOccurrences(value, needle) {
  if (!needle) return 0;
  let count = 0;
  let cursor = 0;
  while (true) {
    const index = value.indexOf(needle, cursor);
    if (index === -1) return count;
    count += 1;
    cursor = index + needle.length;
  }
}

function changedLineCount(before, after) {
  const left = before.split('\n');
  const right = after.split('\n');
  if (left.length * right.length > 250_000) {
    // Avoid quadratic work on adversarial fixtures. Returning the larger line count causes the
    // independent change-budget evaluator to fail closed.
    return Math.max(left.length, right.length);
  }
  const rows = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      rows[i][j] = left[i - 1] === right[j - 1]
        ? rows[i - 1][j - 1] + 1
        : Math.max(rows[i - 1][j], rows[i][j - 1]);
    }
  }
  const common = rows[left.length][right.length];
  return left.length + right.length - 2 * common;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyEnsureRobots(content, instruction) {
  const directive = `Sitemap: ${instruction.sitemapUrl}`;
  if (content === null) {
    return { content: `User-agent: *\nAllow: /\n\n${directive}\n`, evidence: `created robots.txt with ${directive}` };
  }
  const sitemapLines = content.split(/\r?\n/).filter((line) => /^\s*Sitemap\s*:/i.test(line));
  if (sitemapLines.length > 1) throw new Error('robots.txt has multiple Sitemap directives');
  if (sitemapLines.length === 1) {
    if (sitemapLines[0].trim() === directive) throw new Error('approved Sitemap directive already exists');
    throw new Error('robots.txt has an ambiguous existing Sitemap directive');
  }
  const separator = content.endsWith('\n') ? '' : '\n';
  return { content: `${content}${separator}\n${directive}\n`, evidence: `added ${directive}` };
}

function applyRemoveSitemapUrl(content, instruction) {
  if (content === null) throw new Error('sitemap target file is missing');
  const escaped = escapeRegExp(instruction.url);
  const blockPattern = new RegExp(
    `<url>(?:(?!</url>)[\\s\\S])*?<loc>\\s*${escaped}\\s*</loc>(?:(?!</url>)[\\s\\S])*?</url>\\s*`,
    'g'
  );
  const matches = content.match(blockPattern) ?? [];
  if (matches.length !== 1) throw new Error('rejected sitemap URL must occur in exactly one <url> block');
  const next = content.replace(blockPattern, '');
  if (next.includes(instruction.url)) throw new Error('rejected sitemap URL remains after bounded removal');
  return { content: next, evidence: `removed exact sitemap URL ${instruction.url}` };
}

function applyReplaceBrokenLink(content, instruction) {
  if (content === null) throw new Error('internal-link target file is missing');
  if (countOccurrences(content, instruction.from) !== 1) {
    throw new Error('broken link must occur exactly once');
  }
  if (countOccurrences(content, instruction.to) !== 0) {
    throw new Error('replacement link already exists and would be ambiguous');
  }
  const next = content.replace(instruction.from, instruction.to);
  return { content: next, evidence: `replaced exact internal link ${instruction.from}` };
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function executeRepairJob(job) {
  if (!job || job.schemaVersion !== 1 || typeof job.jobId !== 'string' || !job.request) {
    throw new Error('invalid job envelope');
  }
  const request = job.request;
  if (request.mode !== 'shadow') throw new Error('runner only supports shadow mode');
  const repoRoot = typeof job.repoRoot === 'string' ? job.repoRoot : '/workspace/repo';
  const instruction = request.instruction;
  const targetPath = safePath(repoRoot, instruction.path);
  const before = await readOptional(targetPath);

  let applied;
  if (instruction.skillId === 'ensure-robots-sitemap') {
    applied = applyEnsureRobots(before, instruction);
  } else if (instruction.skillId === 'remove-sitemap-url') {
    applied = applyRemoveSitemapUrl(before, instruction);
  } else if (instruction.skillId === 'replace-broken-internal-link') {
    applied = applyReplaceBrokenLink(before, instruction);
  } else {
    throw new Error(`unsupported repair skill: ${instruction.skillId}`);
  }

  if (applied.content === before) throw new Error('repair produced no change');
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, applied.content, 'utf8');

  const finalPaths = new Set([...Object.keys(request.fixture.files), instruction.path]);
  const finalFiles = {};
  for (const relativePath of [...finalPaths].sort()) {
    const content = await readOptional(safePath(repoRoot, relativePath));
    if (content === null) throw new Error(`final fixture file is missing: ${relativePath}`);
    finalFiles[relativePath] = content;
  }

  return {
    schemaVersion: 1,
    jobId: job.jobId,
    skillId: instruction.skillId,
    ok: true,
    changed: true,
    changedFiles: [
      {
        path: instruction.path,
        beforeSha256: before === null ? null : sha256(before),
        afterSha256: sha256(applied.content),
        changedLines: changedLineCount(before ?? '', applied.content),
      },
    ],
    finalFiles,
    postcondition: { passed: true, evidence: applied.evidence },
    failureReason: null,
  };
}

async function selfTest() {
  const root = await mkdtemp(join(tmpdir(), 'geopulse-repair-runner-'));
  try {
    const job = {
      schemaVersion: 1,
      jobId: 'container-self-test',
      repoRoot: root,
      request: {
        mode: 'shadow',
        fixture: { files: { 'app/page.tsx': '<a href="/old">Old</a>\n' } },
        instruction: {
          skillId: 'replace-broken-internal-link',
          path: 'app/page.tsx',
          from: '/old',
          to: '/new',
        },
      },
    };
    await mkdir(join(root, 'app'), { recursive: true });
    await writeFile(join(root, 'app/page.tsx'), job.request.fixture.files['app/page.tsx'], 'utf8');
    const result = await executeRepairJob(job);
    if (!result.ok || result.finalFiles['app/page.tsx'] !== '<a href="/new">Old</a>\n') {
      throw new Error('container self-test postcondition failed');
    }
    process.stdout.write(`${JSON.stringify({ ok: true, evidence: result.postcondition.evidence })}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (inputPath === '--self-test') {
    await selfTest();
    return;
  }
  if (!inputPath || !outputPath) throw new Error('usage: repair-runner.mjs <job.json> <result.json>');
  const job = JSON.parse(await readFile(inputPath, 'utf8'));
  let result;
  try {
    result = await executeRepairJob(job);
  } catch (error) {
    result = {
      schemaVersion: 1,
      jobId: typeof job?.jobId === 'string' ? job.jobId : 'unknown',
      skillId: job?.request?.instruction?.skillId ?? 'unknown',
      ok: false,
      changed: false,
      changedFiles: [],
      finalFiles: {},
      postcondition: { passed: false, evidence: 'runner failed closed' },
      failureReason: error instanceof Error ? error.message : 'unknown runner failure',
    };
  }
  await writeFile(outputPath, `${JSON.stringify(result)}\n`, 'utf8');
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
