import { describe, expect, it } from 'vitest';
import { buildSocialContentFunnels, type SocialAttributionEvent } from './social-attribution';

function event(overrides: Partial<SocialAttributionEvent>): SocialAttributionEvent {
  return {
    event_id: crypto.randomUUID(),
    event_name: 'session_started',
    anonymous_id: null,
    scan_id: null,
    utm_campaign: null,
    utm_content: null,
    ...overrides,
  };
}

describe('buildSocialContentFunnels', () => {
  it('carries a post touch through anonymous and scan identities to delivery and payment', () => {
    const rows = buildSocialContentFunnels([
      event({ event_name: 'session_started', anonymous_id: 'anon-1', utm_campaign: 'autonomous_social', utm_content: 'post-a' }),
      event({ event_name: 'scan_completed', anonymous_id: 'anon-1', scan_id: 'scan-1' }),
      event({ event_name: 'report_delivered', scan_id: 'scan-1' }),
      event({ event_name: 'report_viewed', scan_id: 'scan-1' }),
      event({ event_name: 'checkout_started', scan_id: 'scan-1' }),
      event({ event_name: 'payment_completed', scan_id: 'scan-1' }),
    ]);

    expect(rows).toEqual([{
      content: 'post-a',
      sessions: 1,
      scans: 1,
      reportsDelivered: 1,
      reportsViewed: 1,
      checkouts: 1,
      payments: 1,
    }]);
  });

  it('deduplicates repeated beacons and provider retries', () => {
    const rows = buildSocialContentFunnels([
      event({ event_name: 'session_started', anonymous_id: 'anon-1', utm_campaign: 'autonomous_social', utm_content: 'post-a' }),
      event({ event_name: 'session_started', anonymous_id: 'anon-1', utm_campaign: 'autonomous_social', utm_content: 'post-a' }),
      event({ event_name: 'scan_completed', anonymous_id: 'anon-1', scan_id: 'scan-1' }),
      event({ event_name: 'scan_completed', anonymous_id: 'anon-1', scan_id: 'scan-1' }),
    ]);

    expect(rows[0]).toMatchObject({ sessions: 1, scans: 1 });
  });
});
