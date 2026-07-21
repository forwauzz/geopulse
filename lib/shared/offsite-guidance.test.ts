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

  it('never sells GBP as a ChatGPT lever (spec §2.3 — ChatGPT cannot read GBP reviews)', () => {
    const gbp = OFFSITE_MODULE.levers.find((l) => l.id === 'gbp')!;
    expect(gbp.engines).not.toContain('ChatGPT');
    expect(gbp.why).toContain('ChatGPT cannot read GBP');
    const yelp = OFFSITE_MODULE.levers.find((l) => l.id === 'yelp-bbb')!;
    expect(yelp.engines).toContain('ChatGPT');
  });

  it('routes Gemini to brand-owned site + schema', () => {
    const own = OFFSITE_MODULE.levers.find((l) => l.id === 'own-site-schema')!;
    expect(own.engines).toContain('Gemini');
    expect(own.stat?.claim).toContain('52%');
  });

  it('never advises faking reviews', () => {
    const text = JSON.stringify(OFFSITE_MODULE).toLowerCase();
    expect(text).not.toContain('buy reviews');
    expect(OFFSITE_MODULE.reviewsNote).toContain('faking');
    const reviews = OFFSITE_MODULE.levers.find((l) => l.id === 'reviews')!;
    expect(reviews.what.toLowerCase()).toContain('happy customer');
  });

  it('every stat carries a named source (spec §7)', () => {
    for (const lever of OFFSITE_MODULE.levers) {
      if (lever.stat) {
        expect(lever.stat.source.length, lever.id).toBeGreaterThan(3);
      }
    }
  });
});
