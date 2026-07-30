import { describe, expect, it } from 'vitest';
import {
  isOutreachStopped,
  normalizeOutreachLifecycleStatus,
  progressAfterFailedSend,
  progressAfterSuccessfulSend,
} from './outreach-sequence';

const NOW = Date.parse('2026-07-30T12:00:00.000Z');

describe('outreach commercial sequence', () => {
  it('advances the default sequence from day 0 to day 4', () => {
    const result = progressAfterSuccessfulSend(
      { sequenceStep: 1, maxSequenceSteps: 3, sequenceDelaysDays: [0, 4, 10] },
      NOW,
      '2099-01-01T00:00:00.000Z',
    );

    expect(result).toMatchObject({
      enabled: true,
      lifecycleStatus: 'active',
      sequenceStep: 2,
      nextAction: 'send sequence step 2 of 3',
    });
    expect(result.nextRunAt).toBe('2026-08-03T12:00:00.000Z');
  });

  it('uses the six-day gap between steps two and three', () => {
    const result = progressAfterSuccessfulSend(
      { sequenceStep: 2, maxSequenceSteps: 3, sequenceDelaysDays: [0, 4, 10] },
      NOW,
      '2099-01-01T00:00:00.000Z',
    );

    expect(result.sequenceStep).toBe(3);
    expect(result.nextRunAt).toBe('2026-08-05T12:00:00.000Z');
  });

  it('closes the sequence after the final confirmed send', () => {
    const result = progressAfterSuccessfulSend(
      { sequenceStep: 3, maxSequenceSteps: 3, sequenceDelaysDays: [0, 4, 10] },
      NOW,
      '2099-01-01T00:00:00.000Z',
    );

    expect(result).toMatchObject({
      enabled: false,
      lifecycleStatus: 'completed',
      sequenceStep: 3,
      nextAction: null,
      exitReason: 'sequence_completed',
    });
  });

  it('preserves the legacy recurring schedule when no sequence limit exists', () => {
    const recurringNextRunAt = '2026-08-30T12:00:00.000Z';
    const result = progressAfterSuccessfulSend(
      { sequenceStep: 1, maxSequenceSteps: null, sequenceDelaysDays: [0, 4, 10] },
      NOW,
      recurringNextRunAt,
    );

    expect(result.nextRunAt).toBe(recurringNextRunAt);
    expect(result.lifecycleStatus).toBe('active');
  });

  it('pauses exhausted delivery retries instead of counting a send', () => {
    const result = progressAfterFailedSend({
      consecutiveFailures: 2,
      maxAttempts: 3,
      nowMs: NOW,
      reason: 'http_429',
    });

    expect(result.enabled).toBe(false);
    expect(result.lifecycleStatus).toBe('paused');
    expect(result.consecutiveFailures).toBe(3);
    expect(result.nextAction).toContain('owner must resolve');
  });

  it('treats every non-active lifecycle state as a send stop', () => {
    expect(isOutreachStopped('active')).toBe(false);
    expect(isOutreachStopped('positive_reply')).toBe(true);
    expect(isOutreachStopped('converted')).toBe(true);
    expect(normalizeOutreachLifecycleStatus('unknown')).toBe('active');
  });
});