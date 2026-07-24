import { describe, expect, it } from 'vitest';
import { stableMarketingEventId } from './emit';

describe('stableMarketingEventId', () => {
  it('returns the same valid UUID for the same delivery key', async () => {
    const first = await stableMarketingEventId('stripe:evt_123:payment_completed');
    const second = await stableMarketingEventId('stripe:evt_123:payment_completed');

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('does not collapse different provider events', async () => {
    await expect(stableMarketingEventId('stripe:evt_124:payment_completed'))
      .resolves.not.toBe(await stableMarketingEventId('stripe:evt_123:payment_completed'));
  });
});
