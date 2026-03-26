import { describe, expect, it } from 'vitest';
import { MarketingEventSchema, MARKETING_EVENT_NAMES } from './schema';

function validEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    event_name: 'scan_started',
    ...overrides,
  };
}

describe('MarketingEventSchema', () => {
  it('accepts a minimal valid event', () => {
    const result = MarketingEventSchema.safeParse(validEvent());
    expect(result.success).toBe(true);
  });

  it('accepts a fully populated event', () => {
    const result = MarketingEventSchema.safeParse(
      validEvent({
        event_ts: '2026-03-25T12:00:00Z',
        anonymous_id: 'anon-abc-123',
        scan_id: 'b1b2c3d4-e5f6-7890-abcd-ef1234567890',
        lead_id: 'c1b2c3d4-e5f6-7890-abcd-ef1234567890',
        payment_id: 'd1b2c3d4-e5f6-7890-abcd-ef1234567890',
        user_id: 'e1b2c3d4-e5f6-7890-abcd-ef1234567890',
        email_hash: 'a'.repeat(64),
        utm_source: 'Twitter',
        utm_medium: 'Social',
        utm_campaign: 'Launch-2026',
        utm_content: 'post-1',
        utm_term: 'geo audit',
        referrer_url: 'https://x.com/status/123',
        landing_path: '/',
        channel: 'Social',
        content_id: 'tweet-123',
        metadata_json: { variant: 'a' },
      })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.utm_source).toBe('twitter');
      expect(result.data.channel).toBe('social');
    }
  });

  it('rejects missing event_id', () => {
    const { event_id: _, ...rest } = validEvent();
    const result = MarketingEventSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing event_name', () => {
    const { event_name: _, ...rest } = validEvent();
    const result = MarketingEventSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects unknown event_name', () => {
    const result = MarketingEventSchema.safeParse(validEvent({ event_name: 'user_clicked' }));
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID event_id', () => {
    const result = MarketingEventSchema.safeParse(validEvent({ event_id: 'not-a-uuid' }));
    expect(result.success).toBe(false);
  });

  it('rejects truncated email_hash (32 chars)', () => {
    const result = MarketingEventSchema.safeParse(validEvent({ email_hash: 'a'.repeat(32) }));
    expect(result.success).toBe(false);
  });

  it('accepts full 64-char email_hash', () => {
    const result = MarketingEventSchema.safeParse(validEvent({ email_hash: 'a'.repeat(64) }));
    expect(result.success).toBe(true);
  });

  it('rejects extra unknown fields (strict mode)', () => {
    const result = MarketingEventSchema.safeParse(validEvent({ unknown_field: 'sneaky' }));
    expect(result.success).toBe(false);
  });

  it('normalizes utm_source to lowercase', () => {
    const result = MarketingEventSchema.safeParse(validEvent({ utm_source: '  LinkedIn  ' }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.utm_source).toBe('linkedin');
    }
  });

  it.each(MARKETING_EVENT_NAMES)('accepts event_name "%s"', (name) => {
    const result = MarketingEventSchema.safeParse(validEvent({ event_name: name }));
    expect(result.success).toBe(true);
  });
});
