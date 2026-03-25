import { describe, expect, it } from 'vitest';
import { marketingContextFromRequest, marketingEventSchema, normalizeCampaignValue, sha256Hex } from './events';

describe('marketing event schema', () => {
  it('accepts minimal valid event', () => {
    const parsed = marketingEventSchema.safeParse({
      eventName: 'scan_started',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown keys (strict)', () => {
    const parsed = marketingEventSchema.safeParse({
      eventName: 'scan_started',
      unknown: 'x',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('normalization helpers', () => {
  it('normalizes campaign values to lowercase + trim', () => {
    expect(normalizeCampaignValue('  Email  ')).toBe('email');
    expect(normalizeCampaignValue('   ')).toBeNull();
    expect(normalizeCampaignValue(undefined)).toBeNull();
  });

  it('returns full sha256 hex (64 chars)', () => {
    const hash = sha256Hex('User@Example.com');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('extracts and normalizes request context fields', () => {
    const req = new Request('https://example.com/api/scan?utm_source=Twitter&utm_campaign=Launch&utm_content=A1', {
      headers: {
        referer: 'https://geopulse.io/',
        'x-anonymous-id': 'anon_123',
      },
    });
    const ctx = marketingContextFromRequest(req);
    expect(ctx.anonymousId).toBe('anon_123');
    expect(ctx.utmSource).toBe('Twitter');
    expect(ctx.utmCampaign).toBe('Launch');
    expect(ctx.contentId).toBe('A1');
    expect(ctx.referrerUrl).toBe('https://geopulse.io/');
  });
});
