import { describe, expect, it } from 'vitest';
import {
  monthlyBuyerIntelligenceDue,
  isMonthlyBuyerIntelligenceCandidate,
  runMonthlyBuyerIntelligenceSweep,
} from './monthly-buyer-intelligence';

describe('monthlyBuyerIntelligenceDue', () => {
  const now = new Date('2026-08-12T20:00:00.000Z');

  it('arms a measured client with no prior monthly run', () => {
    expect(monthlyBuyerIntelligenceDue({}, now)).toBe(true);
  });

  it('waits until the persisted next run', () => {
    expect(monthlyBuyerIntelligenceDue({
      buyer_intelligence_next_at: '2026-09-11T20:00:00.000Z',
    }, now)).toBe(false);
  });

  it('retries when the persisted window is due or invalid', () => {
    expect(monthlyBuyerIntelligenceDue({
      buyer_intelligence_next_at: '2026-08-12T19:59:59.000Z',
    }, now)).toBe(true);
    expect(monthlyBuyerIntelligenceDue({
      buyer_intelligence_next_at: 'invalid',
    }, now)).toBe(true);
  });

  it('fails closed before touching storage when the production lane is disabled', async () => {
    const result = await runMonthlyBuyerIntelligenceSweep({
      supabase: { from: () => { throw new Error('must_not_query'); } } as never,
      env: {},
      reportBucket: {} as never,
      now,
    });
    expect(result).toEqual({ eligible: 0, attempted: 0, completed: 0, failed: 0 });
  });

  it('selects only measured, due clients on the explicit canary allowlist', () => {
    const allowedRecipients = new Set(['internal@alie.test']);
    const base = {
      metadata: { agency_client_id: 'client-1', baseline_status: 'measured' },
      reportEmail: 'Internal@Alie.Test',
      allowedRecipients,
      now,
    };
    expect(isMonthlyBuyerIntelligenceCandidate(base)).toBe(true);
    expect(isMonthlyBuyerIntelligenceCandidate({ ...base, reportEmail: 'customer@example.com' })).toBe(false);
    expect(isMonthlyBuyerIntelligenceCandidate({
      ...base,
      metadata: { ...base.metadata, baseline_status: 'queued' },
    })).toBe(false);
  });
});
