export type OutreachLifecycleStatus =
  | 'active'
  | 'paused'
  | 'replied'
  | 'positive_reply'
  | 'converted'
  | 'unsubscribed'
  | 'disqualified'
  | 'completed';

export const TERMINAL_OUTREACH_STATUSES = new Set<OutreachLifecycleStatus>([
  'replied',
  'positive_reply',
  'converted',
  'unsubscribed',
  'disqualified',
  'completed',
]);

export function normalizeOutreachLifecycleStatus(value: unknown): OutreachLifecycleStatus {
  if (
    value === 'active' ||
    value === 'paused' ||
    value === 'replied' ||
    value === 'positive_reply' ||
    value === 'converted' ||
    value === 'unsubscribed' ||
    value === 'disqualified' ||
    value === 'completed'
  ) {
    return value;
  }
  return 'active';
}

export function isOutreachStopped(status: OutreachLifecycleStatus): boolean {
  return status !== 'active';
}

export type SequenceProgress = {
  sequenceStep: number;
  maxSequenceSteps: number | null;
  sequenceDelaysDays: number[];
};

export type SuccessfulSendProgress = {
  enabled: boolean;
  lifecycleStatus: OutreachLifecycleStatus;
  sequenceStep: number;
  nextRunAt: string;
  nextAction: string | null;
  exitedAt: string | null;
  exitReason: string | null;
};

/**
 * Advance a bounded campaign after a provider-confirmed send.
 * `sequenceDelaysDays` are offsets from enrollment (for example 0, 4, 10), so
 * the gap after step one is four days and the gap after step two is six days.
 */
export function progressAfterSuccessfulSend(
  progress: SequenceProgress,
  nowMs: number,
  recurringNextRunAt: string,
): SuccessfulSendProgress {
  const maxSteps = progress.maxSequenceSteps;
  if (maxSteps == null) {
    return {
      enabled: true,
      lifecycleStatus: 'active',
      sequenceStep: progress.sequenceStep,
      nextRunAt: recurringNextRunAt,
      nextAction: 'send next recurring audit',
      exitedAt: null,
      exitReason: null,
    };
  }

  const currentStep = Math.max(1, Math.min(progress.sequenceStep, maxSteps));
  if (currentStep >= maxSteps) {
    const nowIso = new Date(nowMs).toISOString();
    return {
      enabled: false,
      lifecycleStatus: 'completed',
      sequenceStep: currentStep,
      nextRunAt: nowIso,
      nextAction: null,
      exitedAt: nowIso,
      exitReason: 'sequence_completed',
    };
  }

  const currentOffset = progress.sequenceDelaysDays[currentStep - 1] ?? 0;
  const nextOffset = progress.sequenceDelaysDays[currentStep] ?? currentOffset + 7;
  const gapDays = Math.max(1, nextOffset - currentOffset);
  const nextStep = currentStep + 1;
  return {
    enabled: true,
    lifecycleStatus: 'active',
    sequenceStep: nextStep,
    nextRunAt: new Date(nowMs + gapDays * 24 * 60 * 60 * 1000).toISOString(),
    nextAction: `send sequence step ${nextStep} of ${maxSteps}`,
    exitedAt: null,
    exitReason: null,
  };
}

export function progressAfterFailedSend(args: {
  consecutiveFailures: number;
  maxAttempts: number;
  nowMs: number;
  reason: string;
}): {
  enabled: boolean;
  lifecycleStatus: OutreachLifecycleStatus;
  consecutiveFailures: number;
  nextRunAt: string;
  nextAction: string;
} {
  const failures = Math.max(0, args.consecutiveFailures) + 1;
  const exhausted = failures >= Math.max(1, args.maxAttempts);
  return {
    enabled: !exhausted,
    lifecycleStatus: exhausted ? 'paused' : 'active',
    consecutiveFailures: failures,
    nextRunAt: new Date(args.nowMs + 24 * 60 * 60 * 1000).toISOString(),
    nextAction: exhausted
      ? `owner must resolve delivery failure: ${args.reason}`
      : `retry delivery (${failures}/${Math.max(1, args.maxAttempts)}): ${args.reason}`,
  };
}