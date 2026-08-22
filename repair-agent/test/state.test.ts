import { describe, expect, it } from 'vitest';
import {
  appendAttempt,
  attachWorkflow,
  beginRepair,
  completeRepair,
  enqueueRepairScope,
  initialRepairState,
  leaseNextRepairScope,
  markRepairScopeMerged,
  recordRepairMergeIntent,
  recordRepairMergeAbort,
  recordRepairRollbackIntent,
  recordRepairRolledBack,
  normalizeRepairState,
  acknowledgeRepairScope,
  recordRepairScopeFeedback,
} from '../src/state';
import type { RepairScope } from '../src/loop/contracts';

const now = '2026-08-19T04:00:00.000Z';
const mergeIntent = {
  intentDigest: '9'.repeat(64), pullRequestNumber: 8, issueNumber: 7,
  baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), patchDigest: 'c'.repeat(64),
  controllerCheckRunId: 10, requiredCheckRunIds: [11, 12, 13],
};

describe('repair state machine', () => {
  const scope: RepairScope = {
    schemaVersion: 1,
    attempt: 1,
    feedback: [],
    producer: 'github-shadow-canary',
    repairId: 'repair-1',
    auditRunId: 'audit-1',
    findingId: 'finding-1',
    repositoryProfileId: 'geopulse-v1',
    repositoryProfileDigest: '9'.repeat(64),
    repository: 'forwauzz/geopulse',
    defaultBranch: 'main',
    siteOrigin: 'https://getgeopulse.com',
    sourceFinding: {
      checkId: 'internal-links', targetUrl: 'https://getgeopulse.com/', finding: 'broken link',
      confidence: 'high', risk: 'low', reportedAt: now,
    },
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

  it('leases one scope idempotently, preserves it through production QA, and acknowledges only after merge', () => {
    const queued = enqueueRepairScope(initialRepairState(), scope, now);
    const secondScope = { ...scope, repairId: 'repair-2', auditRunId: 'audit-2', findingId: 'finding-2' };
    const withTwo = enqueueRepairScope(queued, secondScope, now);
    const leased = leaseNextRepairScope(withTwo, 'workflow-run-123456', Date.parse(now), 'repair-1');
    expect(leased.scope?.repairId).toBe('repair-1');
    const repeated = leaseNextRepairScope(leased.state, 'workflow-run-123456', Date.parse(now) + 1_000, 'repair-1');
    expect(repeated.scope?.repairId).toBe('repair-1');
    expect(repeated.state.pendingScopes?.find((item) => item.scope.repairId === 'repair-2')?.state).toBe('pending');
    const gateDigest = 'a'.repeat(64);
    expect(() => acknowledgeRepairScope(leased.state, 'repair-1', 1, 'workflow-run-123456', gateDigest, now)).toThrow('scope is not awaiting production QA');
    const pendingMerge = recordRepairMergeIntent(leased.state, 'repair-1', 1, 'workflow-run-123456', mergeIntent, now);
    expect(pendingMerge.state.pendingScopes?.[0]).toMatchObject({ state: 'merge_pending', mergeIntent });
    const merged = markRepairScopeMerged(pendingMerge.state, 'repair-1', 1, 'workflow-run-123456', { mergeSha: 'd'.repeat(40), mergeDigest: 'e'.repeat(64) }, now);
    expect(merged.state.pendingScopes?.find((item) => item.scope.repairId === 'repair-1')).toMatchObject({ state: 'awaiting_qa', leaseId: 'workflow-run-123456', leaseExpiresAt: null });
    const afterExpiry = leaseNextRepairScope(merged.state, 'other-workflow-123456', Date.parse(now) + 60 * 60_000, 'repair-1');
    expect(afterExpiry.scope).toBeNull();
    expect(() => acknowledgeRepairScope(merged.state, 'repair-1', 1, 'wrong-lease-123456', gateDigest, now)).toThrow('scope is not awaiting production QA');
    const acknowledged = acknowledgeRepairScope(merged.state, 'repair-1', 1, 'workflow-run-123456', gateDigest, now);
    expect(acknowledged.state.pendingScopes?.map((item) => item.scope.repairId)).toEqual(['repair-2']);
    expect(acknowledged.state.auditHistory?.[0]).toMatchObject({ outcome: 'acknowledged', repairId: 'repair-1' });
    const replayed = acknowledgeRepairScope(acknowledged.state, 'repair-1', 1, 'workflow-run-123456', gateDigest, now);
    expect(replayed.replayed).toBe(true);
    expect(replayed.state).toBe(acknowledged.state);
    expect(() => acknowledgeRepairScope(acknowledged.state, 'repair-1', 1, 'workflow-run-123456', 'b'.repeat(64), now)).toThrow('evidence digest does not match');
  });

  it('can return a rolled-back production QA failure to the same repair lineage', () => {
    const queued = enqueueRepairScope(initialRepairState(), scope, now);
    const leased = leaseNextRepairScope(queued, 'workflow-run-prodqa-1', Date.parse(now), 'repair-1');
    const pendingMerge = recordRepairMergeIntent(leased.state, 'repair-1', 1, 'workflow-run-prodqa-1', mergeIntent, now);
    const merged = markRepairScopeMerged(pendingMerge.state, 'repair-1', 1, 'workflow-run-prodqa-1', { mergeSha: 'd'.repeat(40), mergeDigest: '6'.repeat(64) }, now);
    expect(() => recordRepairScopeFeedback(merged.state, 'repair-1', 1, 'workflow-run-prodqa-1', '7'.repeat(64), ['live robots postcondition failed'], now)).toThrow('scope lease does not match');
    const rollbackPending = recordRepairRollbackIntent(merged.state, 'repair-1', 1, 'workflow-run-prodqa-1', '8'.repeat(64), now);
    const rolledBack = recordRepairRolledBack(rollbackPending.state, 'repair-1', 1, 'workflow-run-prodqa-1', {
      rollbackMergeSha: 'f'.repeat(40), deploymentId: 'cloudflare-check-1', versionId: 'build-1', evidenceDigest: '7'.repeat(64),
    }, ['live robots postcondition failed'], now);
    expect(rolledBack).toMatchObject({ requeued: true, nextAttempt: 2, exhausted: false });
    expect(rolledBack.state.pendingScopes?.[0]).toMatchObject({ state: 'pending', scope: { attempt: 2, feedback: ['live robots postcondition failed'] } });
  });

  it('reconciles an unmerged durable intent into exactly one bounded retry', () => {
    const leased = leaseNextRepairScope(enqueueRepairScope(initialRepairState(), scope, now), 'workflow-run-crash-1', Date.parse(now), 'repair-1');
    const pendingMerge = recordRepairMergeIntent(leased.state, 'repair-1', 1, 'workflow-run-crash-1', mergeIntent, now);
    const abortDigest = '4'.repeat(64);
    const aborted = recordRepairMergeAbort(pendingMerge.state, 'repair-1', 1, 'workflow-run-crash-1', abortDigest, ['merge process ended before GitHub accepted it'], now);
    expect(aborted).toMatchObject({ requeued: true, nextAttempt: 2, replayed: false });
    expect(aborted.state.pendingScopes?.[0]).toMatchObject({ state: 'pending', scope: { attempt: 2 } });
    expect(recordRepairMergeAbort(aborted.state, 'repair-1', 1, 'workflow-run-crash-1', abortDigest, ['merge process ended before GitHub accepted it'], now)).toMatchObject({ replayed: true, nextAttempt: 2 });
  });

  it('feeds failed QA back to the same scope and exhausts after three attempts', () => {
    const queued = enqueueRepairScope(initialRepairState(), scope, now);
    const firstLease = leaseNextRepairScope(queued, 'workflow-run-attempt-1', Date.parse(now), 'repair-1');
    const firstFeedback = recordRepairScopeFeedback(firstLease.state, 'repair-1', 1, 'workflow-run-attempt-1', '1'.repeat(64), ['browser regression'], now);
    expect(firstFeedback).toMatchObject({ requeued: true, nextAttempt: 2, exhausted: false });
    expect(firstFeedback.state.pendingScopes?.[0]).toMatchObject({ state: 'pending', scope: { repairId: 'repair-1', attempt: 2, feedback: ['browser regression'] } });
    expect(firstFeedback.state.auditHistory?.[0]).toMatchObject({ outcome: 'changes_requested', reasons: ['browser regression'] });

    const secondLease = leaseNextRepairScope(firstFeedback.state, 'workflow-run-attempt-2', Date.parse(now) + 1_000, 'repair-1');
    const secondFeedback = recordRepairScopeFeedback(secondLease.state, 'repair-1', 2, 'workflow-run-attempt-2', '2'.repeat(64), ['review mismatch'], now);
    expect(secondFeedback).toMatchObject({ requeued: true, nextAttempt: 3, exhausted: false });
    const thirdLease = leaseNextRepairScope(secondFeedback.state, 'workflow-run-attempt-3', Date.parse(now) + 2_000, 'repair-1');
    const exhausted = recordRepairScopeFeedback(thirdLease.state, 'repair-1', 3, 'workflow-run-attempt-3', '3'.repeat(64), ['still failing'], now);
    expect(exhausted).toMatchObject({ requeued: false, nextAttempt: null, exhausted: true });
    expect(exhausted.state.pendingScopes).toEqual([]);
    expect(exhausted.state.exhaustedRepairIds).toContain('repair-1');
    expect(exhausted.state.auditHistory?.[0]).toMatchObject({ outcome: 'exhausted', reasons: ['still failing'] });
  });

  it('replays an exact feedback commit without consuming the next attempt', () => {
    const queued = enqueueRepairScope(initialRepairState(), scope, now);
    const leased = leaseNextRepairScope(queued, 'workflow-run-attempt-1', Date.parse(now), 'repair-1');
    const digest = '4'.repeat(64);
    const first = recordRepairScopeFeedback(leased.state, 'repair-1', 1, 'workflow-run-attempt-1', digest, ['review failed'], now);
    const replay = recordRepairScopeFeedback(first.state, 'repair-1', 1, 'workflow-run-attempt-1', digest, ['review failed'], now);
    expect(replay).toMatchObject({ requeued: true, nextAttempt: 2, exhausted: false, replayed: true });
    expect(replay.state.pendingScopes?.[0]?.scope.attempt).toBe(2);
    expect(() => recordRepairScopeFeedback(first.state, 'repair-1', 1, 'workflow-run-attempt-1', '5'.repeat(64), ['changed evidence'], now)).toThrow('evidence digest does not match');
  });

  it('quarantines legacy persisted scopes while preserving their audit evidence', () => {
    const legacyScope = {
      ...scope,
      attempt: undefined,
      feedback: undefined,
      sourceFinding: undefined,
    };
    const legacy = {
      ...initialRepairState(),
      pendingScopes: [{ scope: legacyScope, state: 'leased' as const, leaseId: 'legacy-workflow-12345', leaseExpiresAt: '2026-08-19T04:15:00.000Z' }],
      auditHistory: [{ auditRunId: scope.auditRunId, recordedAt: now, outcome: 'queued' as const, repairId: scope.repairId, reasons: [] }],
      scopeTransitions: undefined,
    } as unknown as ReturnType<typeof initialRepairState>;

    const normalized = normalizeRepairState(legacy, '2026-08-19T05:00:00.000Z');

    expect(normalized.pendingScopes).toEqual([]);
    expect(normalized.auditHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ auditRunId: 'audit-1', outcome: 'queued' }),
      expect.objectContaining({ auditRunId: 'audit-1', outcome: 'rejected', reasons: ['legacy repair scope quarantined; a fresh provenance-complete audit is required'] }),
    ]));
    expect(normalized.scopeTransitions).toEqual([]);
    expect(normalizeRepairState(normalized, '2026-08-19T06:00:00.000Z')).toBe(normalized);
  });
});
