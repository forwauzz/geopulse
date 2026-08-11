import { describe, expect, it } from 'vitest';
import { readBuyerIntelligenceHeroRef } from './buyer-intelligence-hero';

describe('buyer intelligence hero reference', () => {
  it('accepts only a private PNG or JPEG reference', () => {
    expect(readBuyerIntelligenceHeroRef({ buyer_intelligence_hero: { key: 'heroes/client.png', mime: 'image/png' } }))
      .toEqual({ key: 'heroes/client.png', mime: 'image/png' });
    expect(readBuyerIntelligenceHeroRef({ buyer_intelligence_hero: { key: 'https://outside.example/a.svg', mime: 'image/svg+xml' } })).toBeNull();
    expect(readBuyerIntelligenceHeroRef(null)).toBeNull();
  });
});
