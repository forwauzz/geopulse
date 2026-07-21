import { describe, expect, it } from 'vitest';
import { classifyPageTier, sortPagesByTier } from './page-tiers';
import { assessBuyerQuestionCoverage } from './buyer-question-coverage';
import { evaluateHreflang } from '../scan-engine/checks/check-hreflang';
import { measureInformationGain, informationGainCheck } from '../scan-engine/checks/check-information-gain';
import type { CheckContext, PageSignals } from '../lib/interfaces/audit';

describe('page tiers (spec C12)', () => {
  it('classifies money vs supporting vs content pages', () => {
    expect(classifyPageTier('https://x.com/')).toBe('money');
    expect(classifyPageTier('https://x.com/services/managed-it')).toBe('money');
    expect(classifyPageTier('https://x.com/pricing')).toBe('money');
    expect(classifyPageTier('https://x.com/contact-us')).toBe('money');
    expect(classifyPageTier('https://x.com/cybersecurity')).toBe('money');
    expect(classifyPageTier('https://x.com/blog/10-tips')).toBe('content');
    expect(classifyPageTier('https://x.com/about-us')).toBe('supporting');
  });

  it('sorts money pages first, stable', () => {
    const sorted = sortPagesByTier([
      { url: 'https://x.com/blog/a' },
      { url: 'https://x.com/services' },
      { url: 'https://x.com/team' },
      { url: 'https://x.com/pricing' },
    ]);
    expect(sorted.map((p) => p.url)).toEqual([
      'https://x.com/services',
      'https://x.com/pricing',
      'https://x.com/team',
      'https://x.com/blog/a',
    ]);
  });
});

describe('buyer-question coverage (spec C13)', () => {
  it('detects gaps from URLs and never fabricates citation data', () => {
    const c = assessBuyerQuestionCoverage([
      { url: 'https://x.com/' },
      { url: 'https://x.com/services/managed-it' },
      { url: 'https://x.com/blog/post' },
    ]);
    expect(c.gaps.find((g) => g.category === 'service')?.covered).toBe(true);
    expect(c.gaps.find((g) => g.category === 'comparison')?.covered).toBe(false);
    expect(c.gaps.find((g) => g.category === 'proof')?.covered).toBe(false);
    expect(c.note).toContain('not live citation share');
  });

  it('recognizes coverage from page text too', () => {
    const c = assessBuyerQuestionCoverage([
      { url: 'https://x.com/', textSample: 'Proudly serving Montreal and Laval. Read our case study with Acme.' },
    ]);
    expect(c.gaps.find((g) => g.category === 'location')?.covered).toBe(true);
    expect(c.gaps.find((g) => g.category === 'proof')?.covered).toBe(true);
  });
});

describe('hreflang parity (spec C14)', () => {
  const url = 'https://x.com/en/services';

  it('passes cleanly when absent (monolingual site)', () => {
    const r = evaluateHreflang({ entries: [], finalUrl: url, htmlLang: 'en' });
    expect(r.status).toBe('PASS');
  });

  it('fails on missing self-reference', () => {
    const r = evaluateHreflang({
      entries: [{ lang: 'fr', href: 'https://x.com/fr/services' }],
      finalUrl: url,
      htmlLang: 'en',
    });
    expect(r.status).toBe('FAIL');
    expect(r.finding).toContain('self-reference');
  });

  it('warns on missing x-default when the rest is coherent', () => {
    const r = evaluateHreflang({
      entries: [
        { lang: 'en', href: url },
        { lang: 'fr', href: 'https://x.com/fr/services' },
      ],
      finalUrl: url,
      htmlLang: 'en',
    });
    expect(r.status).toBe('WARNING');
    expect(r.finding).toContain('x-default');
  });

  it('passes a complete reciprocal set', () => {
    const r = evaluateHreflang({
      entries: [
        { lang: 'en', href: url },
        { lang: 'fr', href: 'https://x.com/fr/services' },
        { lang: 'x-default', href: 'https://x.com/en/services' },
      ],
      finalUrl: url,
      htmlLang: 'en',
    });
    expect(r.status).toBe('PASS');
  });

  it('fails on duplicate language annotations', () => {
    const r = evaluateHreflang({
      entries: [
        { lang: 'en', href: url },
        { lang: 'en', href: 'https://x.com/other' },
        { lang: 'x-default', href: url },
      ],
      finalUrl: url,
      htmlLang: 'en',
    });
    expect(r.status).toBe('FAIL');
  });
});

describe('information gain (spec C15)', () => {
  function ctx(textSample: string): CheckContext {
    return {
      signals: {} as PageSignals,
      finalUrl: 'https://x.com/',
      textSample,
      robotsTxtContent: '',
      llmsTxtContent: '',
      responseHeaders: {},
    };
  }

  it('fails templated copy with no specifics', async () => {
    const boiler =
      'We provide best-in-class solutions tailored to your needs. Our cutting-edge, world-class team is committed to excellence and seamless integration, offering a holistic approach that will take your business to the next level. '.repeat(4);
    const r = await informationGainCheck.run(ctx(boiler));
    expect(r.status).toBe('FAIL');
    expect(r.fix).toContain('Princeton');
  });

  it('passes concrete, specific copy', async () => {
    const specific =
      'Founded in 2012, we support 1400 endpoints for 85 clients across Montreal. Average response time: 14 minutes. Plans start at $45 per user. Our team holds CompTIA and CISSP certifications, and we are a Microsoft Partner. Read the case study: how Clinique Nordique cut downtime 72% in 2025. '.repeat(2);
    const r = await informationGainCheck.run(ctx(specific));
    expect(r.status).toBe('PASS');
  });

  it('measures both densities', () => {
    const s = measureInformationGain('We are committed to excellence. Prices start at $99 and we serve 40 clients since 2015.');
    expect(s.boilerplateHits.length).toBeGreaterThan(0);
    expect(s.specificityHits).toBeGreaterThanOrEqual(3);
  });

  it('skips judgment on very short pages', async () => {
    const r = await informationGainCheck.run(ctx('Contact us today.'));
    expect(r.status).toBe('PASS');
  });
});
