import { describe, expect, it } from 'vitest';
import {
  appendAttempt,
  attachWorkflow,
  beginRepair,
  completeRepair,
  initialRepairState,
} from '../src/state';

const now = '2026-08-19T04:00:00.000Z';

describe('repair state machine', () => {
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
    });
  });
});
