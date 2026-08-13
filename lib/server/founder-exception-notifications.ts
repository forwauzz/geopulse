import { createHash } from 'node:crypto';
import type { ChiefOfStaffAction } from './campaign-control-room';
import type { DailyCompanyStandup } from './daily-company-standup';

export type FounderExceptionKind = 'failure' | 'qualified_reply' | 'purchase' | 'founder_decision';

export type FounderExceptionSignal = {
  readonly signalKey: string;
  readonly kind: FounderExceptionKind;
  readonly summary: string;
};

export type FounderPurchase = {
  readonly id: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly type: string;
};

export type FounderQualifiedReply = {
  readonly providerEventId: string;
  readonly forwarded: boolean;
};

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 20);
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isRequiredDecision(value: string): boolean {
  const decision = compact(value);
  // Reliability incidents are already represented by the concrete failure signals. The control
  // room's generic review sentence is operational context, not a founder decision.
  return decision.length > 0 && !/^Review \d+ recent reliability exceptions?\.?$/i.test(decision);
}

/**
 * Classify only events that justify interrupting the founder. Stable keys deduplicate unchanged
 * exceptions; material changes to the detail produce a new key and are eligible once.
 */
export function classifyFounderExceptions(args: {
  readonly actions: readonly ChiefOfStaffAction[];
  readonly standup: Pick<DailyCompanyStandup, 'founderDecisions'>;
  readonly purchases: readonly FounderPurchase[];
  readonly qualifiedReplies?: readonly FounderQualifiedReply[];
}): FounderExceptionSignal[] {
  const failures = args.actions
    .filter((action) => action.severity === 'now')
    .map((action) => {
      const detail = compact(action.detail);
      return {
        signalKey: `failure:${action.key}:${fingerprint(`${action.resolution}|${detail}`)}`,
        kind: 'failure' as const,
        summary: `${compact(action.title)} — ${detail}`,
      };
    });
  const decisions = args.standup.founderDecisions.filter(isRequiredDecision).map((decision) => {
    const summary = compact(decision);
    return {
      signalKey: `founder_decision:${fingerprint(summary)}`,
      kind: 'founder_decision' as const,
      summary,
    };
  });
  const purchases = args.purchases.map((purchase) => ({
    signalKey: `purchase:${purchase.id}`,
    kind: 'purchase' as const,
    summary: `Verified ${purchase.type} purchase: ${(purchase.amountCents / 100).toFixed(2)} ${purchase.currency.toUpperCase()}.`,
  }));
  const qualifiedReplies = (args.qualifiedReplies ?? []).map((reply) => ({
    signalKey: `qualified_reply:${reply.providerEventId}`,
    kind: 'qualified_reply' as const,
    summary: 'A positive outreach reply was received and matched to an active prospect.',
  }));
  const unique = new Map<string, FounderExceptionSignal>();
  for (const signal of [...failures, ...decisions, ...purchases, ...qualifiedReplies]) {
    if (!unique.has(signal.signalKey)) unique.set(signal.signalKey, signal);
  }
  return [...unique.values()].sort((left, right) => left.signalKey.localeCompare(right.signalKey));
}

export function unseenFounderExceptions(
  signals: readonly FounderExceptionSignal[],
  recordedSignalKeys: ReadonlySet<string>,
): FounderExceptionSignal[] {
  return signals.filter((signal) => !recordedSignalKeys.has(signal.signalKey));
}

export function founderExceptionSummary(signals: readonly FounderExceptionSignal[]): string {
  return signals.map((signal) => {
    const label = signal.kind === 'founder_decision'
      ? 'Decision required'
      : signal.kind === 'qualified_reply'
        ? 'Qualified reply'
        : signal.kind === 'purchase'
          ? 'Purchase'
          : 'Failure';
    return `${label}: ${signal.summary}`;
  }).join('\n');
}
