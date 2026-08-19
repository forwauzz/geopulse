import type { RepairRequest, RunnerResult } from '../src/contracts';
import { createHash } from 'node:crypto';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function validRepairRequest(): RepairRequest {
  return {
    schemaVersion: 1,
    mode: 'shadow',
    repository: 'forwauzz/geopulse',
    siteOrigin: 'https://getgeopulse.com',
    idempotencyKey: 'audit-1:broken-link-1',
    attempt: 1,
    feedback: [],
    finding: {
      findingId: 'broken-link-1',
      sourceAuditId: 'audit-1',
      checkId: 'broken-internal-link',
      targetUrl: 'https://getgeopulse.com/resources',
      finding: 'The resources page links to a removed article.',
      confidence: 'high',
      risk: 'low',
      reportedAt: '2026-08-19T04:00:00.000Z',
    },
    instruction: {
      skillId: 'replace-broken-internal-link',
      path: 'app/resources/page.tsx',
      from: '/articles/old-guide',
      to: '/articles/new-guide',
    },
    changeBudget: { maxFiles: 1, maxChangedLines: 4 },
    fixture: {
      files: {
        'app/resources/page.tsx': '<a href="/articles/old-guide">Guide</a>\n',
        'app/resources/layout.tsx': '<main>Resources</main>\n',
      },
    },
  };
}

export function passingRunnerResult(jobId = 'job-1'): RunnerResult {
  return {
    schemaVersion: 1,
    jobId,
    skillId: 'replace-broken-internal-link',
    ok: true,
    changed: true,
    changedFiles: [
      {
        path: 'app/resources/page.tsx',
        beforeSha256: sha256('<a href="/articles/old-guide">Guide</a>\n'),
        afterSha256: sha256('<a href="/articles/new-guide">Guide</a>\n'),
        changedLines: 2,
      },
    ],
    finalFiles: {
      'app/resources/page.tsx': '<a href="/articles/new-guide">Guide</a>\n',
      'app/resources/layout.tsx': '<main>Resources</main>\n',
    },
    postcondition: { passed: true, evidence: 'replaced exact internal link' },
    failureReason: null,
  };
}
