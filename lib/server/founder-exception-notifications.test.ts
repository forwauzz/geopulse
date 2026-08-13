import { describe, expect, it } from 'vitest';
import {
  classifyFounderExceptions,
  founderExceptionSummary,
  unseenFounderExceptions,
} from './founder-exception-notifications';

const action = {
  key: 'runtime:social-proof',
  severity: 'now' as const,
  owner: 'Jordan',
  resolution: 'agent' as const,
  title: 'Social production failed repeatedly',
  detail: 'Three consecutive renderer failures.',
  playbook: 'Retry safely.',
  href: '/admin/campaigns',
};

describe('founder exception notifications', () => {
  it('suppresses a healthy day with no qualifying event', () => {
    expect(classifyFounderExceptions({
      actions: [{ ...action, severity: 'watch' }],
      standup: { founderDecisions: [] },
      purchases: [],
      qualifiedReplies: [],
    })).toEqual([]);
  });

  it('does not duplicate concrete failures with the generic reliability review sentence', () => {
    const signals = classifyFounderExceptions({
      actions: [action],
      standup: { founderDecisions: ['Review 8 recent reliability exceptions.'] },
      purchases: [],
      qualifiedReplies: [],
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]?.kind).toBe('failure');
  });

  it('classifies failures, purchases, and decisions with stable keys', () => {
    const signals = classifyFounderExceptions({
      actions: [action, action],
      standup: { founderDecisions: ['Approve a new external provider.'] },
      purchases: [{ id: 'pay-1', amountCents: 3900, currency: 'cad', type: 'monitoring' }],
      qualifiedReplies: [{ providerEventId: 'reply-1', forwarded: false }],
    });
    expect(signals).toHaveLength(4);
    expect(signals.map((item) => item.kind).sort()).toEqual([
      'failure', 'founder_decision', 'purchase', 'qualified_reply',
    ]);
    expect(founderExceptionSummary(signals)).toContain('Purchase: Verified monitoring purchase: 39.00 CAD.');
  });

  it('deduplicates an unchanged exception and permits a material change', () => {
    const first = classifyFounderExceptions({
      actions: [action], standup: { founderDecisions: [] }, purchases: [],
      qualifiedReplies: [],
    });
    expect(unseenFounderExceptions(first, new Set([first[0]!.signalKey]))).toEqual([]);
    const changed = classifyFounderExceptions({
      actions: [{ ...action, detail: 'Four consecutive renderer failures.' }],
      standup: { founderDecisions: [] },
      purchases: [],
      qualifiedReplies: [],
    });
    expect(changed[0]!.signalKey).not.toBe(first[0]!.signalKey);
    expect(unseenFounderExceptions(changed, new Set([first[0]!.signalKey]))).toEqual(changed);
  });
});
