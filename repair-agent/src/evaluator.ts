import type { EvaluationResult, RepairRequest, RunnerResult } from './contracts';
import { getRepairSkill } from './skills';
import { digestChangedContent, sha256Text } from './artifact';

function countOccurrences(value: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let cursor = 0;
  while (true) {
    const index = value.indexOf(needle, cursor);
    if (index === -1) return count;
    count += 1;
    cursor = index + needle.length;
  }
}

function stripComments(value: string): string {
  let output = '';
  let state: 'code' | 'string' | 'line-comment' | 'block-comment' = 'code';
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    const next = value[index + 1];
    if (state === 'line-comment') { if (char === '\n') { state = 'code'; output += char; } else output += ' '; continue; }
    if (state === 'block-comment') { if (char === '*' && next === '/') { output += '  '; index += 1; state = 'code'; } else output += char === '\n' ? '\n' : ' '; continue; }
    if (state === 'string') { output += char; if (char === '\\') { output += next ?? ''; index += 1; } else if (char === quote) state = 'code'; continue; }
    if (char === '/' && next === '/') { output += '  '; index += 1; state = 'line-comment'; continue; }
    if (char === '/' && next === '*') { output += '  '; index += 1; state = 'block-comment'; continue; }
    if (char === '\'' || char === '"' || char === '`') { state = 'string'; quote = char; }
    output += char;
  }
  if (state === 'block-comment' || state === 'string') throw new Error('unterminated string or comment');
  return output;
}

function matchingDelimiter(value: string, start: number, open: string, close: string): number {
  let depth = 0;
  let quote = '';
  let state: 'code' | 'string' | 'line-comment' | 'block-comment' = 'code';
  for (let index = start; index < value.length; index += 1) {
    const char = value[index]!;
    const next = value[index + 1];
    if (state === 'line-comment') { if (char === '\n') state = 'code'; continue; }
    if (state === 'block-comment') { if (char === '*' && next === '/') { index += 1; state = 'code'; } continue; }
    if (state === 'string') { if (char === '\\') index += 1; else if (char === quote) state = 'code'; continue; }
    if (char === '/' && next === '/') { index += 1; state = 'line-comment'; continue; }
    if (char === '/' && next === '*') { index += 1; state = 'block-comment'; continue; }
    if (char === '\'' || char === '"' || char === '`') { state = 'string'; quote = char; continue; }
    if (char === open) depth += 1;
    if (char === close && --depth === 0) return index;
  }
  throw new Error(`unmatched ${open}`);
}

function returnedRobotsRules(value: string): string | null {
  try {
    const functions = [...value.matchAll(/export\s+default\s+async\s+function\s+robots\s*\(/g)];
    if (functions.length !== 1 || functions[0]!.index === undefined) return null;
    const functionOpen = value.indexOf('{', functions[0]!.index! + functions[0]![0].length);
    const functionEnd = matchingDelimiter(value, functionOpen, '{', '}');
    const body = value.slice(functionOpen + 1, functionEnd);
    const returns = [...stripComments(body).matchAll(/\breturn\s*\{/g)];
    if (returns.length !== 1 || returns[0]!.index === undefined) return null;
    const returnOpen = value.indexOf('{', functionOpen + 1 + returns[0]!.index!);
    const returnEnd = matchingDelimiter(value, returnOpen, '{', '}');
    const returned = value.slice(returnOpen + 1, returnEnd);
    const rules = [...stripComments(returned).matchAll(/\brules\s*:\s*\[/g)];
    if (rules.length !== 1 || rules[0]!.index === undefined) return null;
    const start = value.indexOf('[', returnOpen + 1 + rules[0]!.index!);
    return stripComments(value.slice(start, matchingDelimiter(value, start, '[', ']') + 1));
  } catch {
    return null;
  }
}

function isSha256(value: string | null): boolean {
  return value === null || /^[a-f0-9]{64}$/.test(value);
}

function verifyPostcondition(request: RepairRequest, result: RunnerResult): string | null {
  const output = result.finalFiles[request.instruction.path];
  if (typeof output !== 'string') return 'target file is absent from final evidence';

  if (request.instruction.skillId === 'ensure-robots-sitemap') {
    const directive = `Sitemap: ${request.instruction.sitemapUrl}`;
    return countOccurrences(output, directive) === 1
      ? null
      : 'robots.txt does not contain exactly one approved Sitemap directive';
  }
  if (request.instruction.skillId === 'allow-ai-retrieval-agents') {
    const rules = returnedRobotsRules(output);
    if (rules === null) return 'app/robots.ts returned rules array is ambiguous';
    const requiredAgents = [
      'Googlebot',
      'Bingbot',
      'OAI-SearchBot',
      'Claude-SearchBot',
      'PerplexityBot',
    ];
    for (const agent of requiredAgents) {
      const escaped = agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rule = new RegExp(
        `\\{\\s*userAgent\\s*:\\s*['\"]${escaped}['\"]\\s*,\\s*allow\\s*:\\s*['\"]/['\"]\\s*\\}`,
        'g'
      );
      if ((rules.match(rule) ?? []).length !== 1) {
        return `app/robots.ts does not contain exactly one approved allow rule for ${agent}`;
      }
    }
    return null;
  }
  if (request.instruction.skillId === 'remove-sitemap-url') {
    return output.includes(request.instruction.url) ? 'rejected sitemap URL remains in the target file' : null;
  }
  if (countOccurrences(output, request.instruction.from) !== 0) {
    return 'broken internal link remains in the target file';
  }
  if (countOccurrences(output, request.instruction.to) !== 1) {
    return 'approved replacement link does not appear exactly once';
  }
  return null;
}

async function digestEvidence(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function evaluateRepair(
  jobId: string,
  request: RepairRequest,
  result: RunnerResult
): Promise<EvaluationResult> {
  const failures: string[] = [];
  const skill = getRepairSkill(request.instruction.skillId);

  if (result.schemaVersion !== 1) failures.push('runner evidence schema is unsupported');
  if (result.jobId !== jobId) failures.push('runner job identity does not match');
  if (result.skillId !== request.instruction.skillId) failures.push('runner skill identity does not match');
  if (!result.ok) failures.push(result.failureReason ?? 'runner reported failure');
  if (!result.changed) failures.push('repair produced no change');
  if (!result.postcondition.passed) failures.push('runner postcondition failed');
  if (result.changedFiles.length === 0) failures.push('runner supplied no changed-file evidence');
  if (result.changedFiles.length > request.changeBudget.maxFiles) failures.push('request file budget exceeded');
  if (result.changedFiles.length > skill.maximumFiles) failures.push('skill file budget exceeded');

  const changedPaths = new Set(result.changedFiles.map((file) => file.path));
  if (changedPaths.size !== result.changedFiles.length) failures.push('duplicate changed-file evidence');
  if (changedPaths.size !== 1 || !changedPaths.has(request.instruction.path)) {
    failures.push('repair changed a file outside the exact target');
  }

  const totalChangedLines = result.changedFiles.reduce((sum, file) => sum + file.changedLines, 0);
  if (totalChangedLines > request.changeBudget.maxChangedLines) failures.push('request changed-line budget exceeded');
  if (totalChangedLines > skill.maximumChangedLines) failures.push('skill changed-line budget exceeded');
  for (const file of result.changedFiles) {
    if (!isSha256(file.beforeSha256) || !isSha256(file.afterSha256)) failures.push('invalid file evidence digest');
    if (file.beforeSha256 === file.afterSha256) failures.push('before and after file digests are identical');
    if (!Number.isInteger(file.changedLines) || file.changedLines < 1) failures.push('invalid changed-line evidence');
    const original = request.fixture.files[file.path];
    const final = result.finalFiles[file.path];
    const expectedBefore = original === undefined ? null : await sha256Text(original);
    const expectedAfter = typeof final === 'string' ? await sha256Text(final) : null;
    if (file.beforeSha256 !== expectedBefore) failures.push(`before digest does not match fixture content: ${file.path}`);
    if (expectedAfter === null || file.afterSha256 !== expectedAfter) failures.push(`after digest does not match final content: ${file.path}`);
  }

  const fixturePaths = Object.keys(request.fixture.files).sort();
  const finalPaths = Object.keys(result.finalFiles).sort();
  const expectedPaths = new Set(fixturePaths);
  expectedPaths.add(request.instruction.path);
  if (JSON.stringify(finalPaths) !== JSON.stringify([...expectedPaths].sort())) {
    failures.push('final file inventory differs from the bounded fixture');
  }
  for (const [path, original] of Object.entries(request.fixture.files)) {
    if (path !== request.instruction.path && result.finalFiles[path] !== original) {
      failures.push(`unrelated fixture file changed: ${path}`);
    }
  }

  const postconditionFailure = verifyPostcondition(request, result);
  if (postconditionFailure !== null) failures.push(postconditionFailure);

  const uniqueFailures = [...new Set(failures)];
  const evidenceDigest = await digestEvidence({
    jobId,
    repository: request.repository,
    siteOrigin: request.siteOrigin,
    idempotencyKey: request.idempotencyKey,
    attempt: request.attempt,
    feedback: request.feedback,
    instruction: request.instruction,
    changedFiles: result.changedFiles,
    contentDigest: await digestChangedContent(result.changedFiles, result.finalFiles),
    postcondition: result.postcondition,
    failures: uniqueFailures,
  });
  const hardGateCount = 12;
  return {
    passed: uniqueFailures.length === 0,
    hardGateFailures: uniqueFailures,
    evidenceDigest,
    score: Math.max(0, (hardGateCount - uniqueFailures.length) / hardGateCount),
  };
}
