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
