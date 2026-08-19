import { describe, expect, it } from 'vitest';
import { evaluateRepair } from '../src/evaluator';
import { passingRunnerResult, validRepairRequest } from './fixtures';

describe('independent repair evaluator', () => {
  it('passes only complete bounded evidence', async () => {
    const result = await evaluateRepair('job-1', validRepairRequest(), passingRunnerResult());
    expect(result.passed).toBe(true);
    expect(result.hardGateFailures).toEqual([]);
    expect(result.evidenceDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('blocks when the target finding remains', async () => {
    const runner = passingRunnerResult();
    runner.finalFiles['app/resources/page.tsx'] = '<a href="/articles/old-guide">Guide</a>\n';
    const result = await evaluateRepair('job-1', validRepairRequest(), runner);
    expect(result.passed).toBe(false);
    expect(result.hardGateFailures).toContain('broken internal link remains in the target file');
  });

  it('blocks unrelated-file regressions', async () => {
    const runner = passingRunnerResult();
    runner.finalFiles['app/resources/layout.tsx'] = '<main>Regressed</main>\n';
    const result = await evaluateRepair('job-1', validRepairRequest(), runner);
    expect(result.passed).toBe(false);
    expect(result.hardGateFailures).toContain(
      'unrelated fixture file changed: app/resources/layout.tsx'
    );
  });

  it('blocks excessive diff scope and missing evidence', async () => {
    const runner = passingRunnerResult();
    runner.changedFiles.push({
      path: 'app/resources/layout.tsx',
      beforeSha256: 'c'.repeat(64),
      afterSha256: 'd'.repeat(64),
      changedLines: 20,
    });
    runner.postcondition.passed = false;
    const result = await evaluateRepair('job-1', validRepairRequest(), runner);
    expect(result.passed).toBe(false);
    expect(result.hardGateFailures).toContain('request file budget exceeded');
    expect(result.hardGateFailures).toContain('request changed-line budget exceeded');
    expect(result.hardGateFailures).toContain('runner postcondition failed');
  });

  it('blocks identity and digest tampering', async () => {
    const runner = passingRunnerResult('different-job');
    runner.changedFiles[0]!.afterSha256 = 'not-a-digest';
    const result = await evaluateRepair('job-1', validRepairRequest(), runner);
    expect(result.passed).toBe(false);
    expect(result.hardGateFailures).toContain('runner job identity does not match');
    expect(result.hardGateFailures).toContain('invalid file evidence digest');
  });
});
