import { describe, expect, it } from 'vitest';
import { OFFSITE_MODULE } from './offsite-guidance';

describe('off-site module (spec §2.3 / C8)', () => {
  it('covers NAP, reviews, and directories', () => {
    const ids = OFFSITE_MODULE.levers.map((l) => l.id);
    expect(ids).toContain('nap-consistency');
    expect(ids).toContain('reviews');
    expect(ids).toContain('yelp-bbb');
    expect(ids).toContain('bing-places');
    expect(ids).toContain('gbp');
    expect(ids).toContain('apple-business-connect');
  });

  it('maps every lever to at least one engine and an operational owner', () => {
    for (const lever of OFFSITE_MODULE.levers) {
      expect(lever.engines.length, lever.id).toBeGreaterThan(0);
      expect(lever.ownerRole.length, lever.id).toBeGreaterThan(2);
      expect(lever.ownerRole).not.toContain('Engineering');
    }
  });

  it('never sells GBP as a ChatGPT lever', () => {
    const gbp = OFFSITE_MODULE.levers.find((l) => l.id === 'gbp')!;
    expect(gbp.engines).not.toContain('ChatGPT');
    expect(gbp.why).toContain('Google lever');
    const yelp = OFFSITE_MODULE.levers.find((l) => l.id === 'yelp-bbb')!;
    expect(yelp.engines).toContain('ChatGPT');
  });

  it('routes Gemini to brand-owned site + schema without a guarantee', () => {
    const own = OFFSITE_MODULE.levers.find((l) => l.id === 'own-site-schema')!;
    expect(own.engines).toContain('Gemini');
    expect(own.why).toContain('do not guarantee');
  });

  it('never advises faking reviews', () => {
    const text = JSON.stringify(OFFSITE_MODULE).toLowerCase();
    expect(text).not.toContain('buy reviews');
    expect(OFFSITE_MODULE.reviewsNote).toContain('faking');
    const reviews = OFFSITE_MODULE.levers.find((l) => l.id === 'reviews')!;
    expect(reviews.what.toLowerCase()).toContain('happy customer');
  });

  it('does not publish unsupported numerical claims or absolute engine behavior', () => {
    const text = JSON.stringify(OFFSITE_MODULE);
    expect(text).not.toMatch(/\d+(?:\.\d+)?%|\d+(?:\.\d+)?x/i);
    expect(text).not.toMatch(/cannot read|top sources|favors/i);
  });
});
