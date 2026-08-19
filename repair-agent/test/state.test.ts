import { describe, expect, it } from 'vitest';
import {
  appendAttempt,
  attachWorkflow,
  beginRepair,
  completeRepair,
  enqueueRepairScope,
  initialRepairState,
  leaseNextRepairScope,
  acknowledgeRepairScope,
} from '../src/state';
import type { RepairScope } from '../src/loop/contracts';

const now = '2026-08-19T04:00:00.000Z';

describe('repair state machine', () => {
  const scope: RepairScope = {
    schemaVersion: 1,
    producer: 'github-shadow-canary',
    repairId: 'repair-1',
    auditRunId: 'audit-1',
    findingId: 'finding-1',
    repositoryProfileId: 'geopulse-v1',
    repository: 'forwauzz/geopulse',
    defaultBranch: 'main',
    siteOrigin: 'https://getgeopulse.com',
    instruction: { skillId: 'replace-broken-internal-link', path: 'app/page.tsx', from: '/old', to: '/new' },
    changeBudget: { maxFiles: 1, maxChangedLines: 10 },
    issue: {
      title: '[REPAIR] link', owner: 'engineer', reviewer: 'reviewer',
      retryPolicy: 'maximum_three_sha_bound_attempts', nextAction: 'repair it', dueAt: now,
      postcondition: 'the broken link is gone',
    },
  };

  it('enforces one active repair and sequential attempts', () => {
    const queued = beginRepair(
      initialRepairState(),
      { jobId: 'job-1', idempotencyKey: 'audit:1', findingId: 'finding-1' },
      now
    );
    expect(() =>
      beginRepair(queued, { jobId: 'job-2', idempotencyKey: 'audit:2', findingId: 'finding-2' }, now)
    ).toThrow('one repair is already active');

    const running = attachWorkflow(queued, 'job-1', 'workflow-1', now);
    const attempted = appendAttempt(
      running,
      'job-1',
      {
        attempt: 1,
        recordedAt: now,
        outcome: 'execution_error',
        evidenceDigest: 'a'.repeat(64),
        reasons: ['transient container start failure'],
      },
      now
    );
    expect(attempted.active?.attempts).toHaveLength(1);
    expect(() =>
      appendAttempt(
        attempted,
        'job-1',
        {
          attempt: 3,
          recordedAt: now,
          outcome: 'execution_error',
          evidenceDigest: null,
          reasons: [],
        },
        now
      )
    ).toThrow('attempt sequence is invalid');
  });

  it('preserves evidence when a repair closes', () => {
    let state = beginRepair(
      initialRepairState(),
      { jobId: 'job-1', idempotencyKey: 'audit:1', findingId: 'finding-1' },
      now
    );
    state = appendAttempt(
      state,
      'job-1',
      {
        attempt: 1,
        recordedAt: now,
        outcome: 'passed',
        evidenceDigest: 'b'.repeat(64),
        reasons: [],
      },
      now
    );
    const complete = completeRepair(state, 'job-1', 'verified_shadow', null, [], now);
    expect(complete.active).toBeNull();
    expect(complete.recent[0]).toMatchObject({
      jobId: 'job-1',
      outcome: 'verified_shadow',
      evidenceDigest: 'b'.repeat(64),
      artifact: null,
    });
  });

  it('leases one scope idempotently and requires the exact lease to acknowledge it', () => {
    const queued = enqueueRepairScope(initialRepairState(), scope, now);
    const secondScope = { ...scope, repairId: 'repair-2', auditRunId: 'audit-2', findingId: 'finding-2' };
    const withTwo = enqueueRepairScope(queued, secondScope, now);
    const leased = leaseNextRepairScope(withTwo, 'workflow-run-123456', Date.parse(now), 'repair-1');
    expect(leased.scope?.repairId).toBe('repair-1');
    const repeated = leaseNextRepairScope(leased.state, 'workflow-run-123456', Date.parse(now) + 1_000, 'repair-1');
    expect(repeated.scope?.repairId).toBe('repair-1');
    expect(repeated.state.pendingScopes?.find((item) => item.scope.repairId === 'repair-2')?.state).toBe('pending');
    expect(() => acknowledgeRepairScope(leased.state, 'repair-1', 'wrong-lease-123456', now)).toThrow('scope lease does not match');
    const acknowledged = acknowledgeRepairScope(leased.state, 'repair-1', 'workflow-run-123456', now);
    expect(acknowledged.pendingScopes?.map((item) => item.scope.repairId)).toEqual(['repair-2']);
    expect(acknowledged.auditHistory?.[0]).toMatchObject({ outcome: 'acknowledged', repairId: 'repair-1' });
  });
});
