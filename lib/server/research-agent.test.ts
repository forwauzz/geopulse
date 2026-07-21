import { describe, expect, it } from 'vitest';
import {
  buildResearchDigestHtml,
  confidenceForTier,
  diffExcerpt,
  hashContent,
  normalizeContent,
  parseExtractionJson,
} from './research-agent';

describe('normalizeContent', () => {
  it('strips markup, scripts, and entities into comparable text', () => {
    const html = '<html><head><script>evil()</script><style>a{}</style></head><body><h1>Bots</h1><p>GPTBot &amp; friends</p></body></html>';
    expect(normalizeContent(html)).toBe('Bots GPTBot friends');
  });

  it('bounds output size', () => {
    expect(normalizeContent('x'.repeat(100_000)).length).toBeLessThanOrEqual(20_000);
  });
});

describe('hashContent', () => {
  it('is stable and change-sensitive', async () => {
    const a = await hashContent('same text');
    const b = await hashContent('same text');
    const c = await hashContent('different text');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('diffExcerpt', () => {
  it('locates the first changed region with context', () => {
    const before = `${'common '.repeat(30)}OAI-SearchBot indexes sites`;
    const after = `${'common '.repeat(30)}OAI-SearchBot-v2 indexes sites`;
    const d = diffExcerpt(before, after);
    expect(d.before).toContain('OAI-SearchBot');
    expect(d.after).toContain('OAI-SearchBot-v2');
  });
});

describe('parseExtractionJson (instruction/data boundary — parse defensively)', () => {
  it('parses a clean response object', () => {
    const out = parseExtractionJson({
      response: 'Here you go: {"claim_before":"old","claim_after":"new","evidence":"quote"}',
    });
    expect(out).toEqual({ claimBefore: 'old', claimAfter: 'new', evidence: 'quote' });
  });

  it('returns null on garbage, prose, or missing claim_after', () => {
    expect(parseExtractionJson('no json here')).toBeNull();
    expect(parseExtractionJson({ response: '{"claim_before":"only"}' })).toBeNull();
    expect(parseExtractionJson(null)).toBeNull();
    expect(parseExtractionJson({ response: '{broken json' })).toBeNull();
  });

  it('caps field lengths', () => {
    const out = parseExtractionJson({
      response: JSON.stringify({ claim_before: 'a'.repeat(2000), claim_after: 'b'.repeat(2000), evidence: 'c' }),
    });
    expect(out?.claimBefore.length).toBe(500);
    expect(out?.claimAfter.length).toBe(500);
  });
});

describe('confidenceForTier (spec §8.3 tier discipline)', () => {
  it('Tier 3 is ALWAYS low — never promoted to fact by the agent', () => {
    expect(confidenceForTier(3, true)).toBe('low');
    expect(confidenceForTier(3, false)).toBe('low');
  });
  it('Tier 1 with a successful extraction is high; without, low', () => {
    expect(confidenceForTier(1, true)).toBe('high');
    expect(confidenceForTier(1, false)).toBe('low');
  });
  it('Tier 2 caps at medium', () => {
    expect(confidenceForTier(2, true)).toBe('medium');
  });
});

describe('buildResearchDigestHtml', () => {
  it('escapes claim text and links the review queue', () => {
    const html = buildResearchDigestHtml([
      {
        sourceUrl: 'https://docs.example/bots',
        sourceTier: 1,
        specSection: '§2.2 / C3',
        claimBefore: 'old',
        claimAfter: 'New bot <TestBot> announced',
        evidence: 'quote',
        confidence: 'high',
      },
    ]);
    expect(html).toContain('&lt;TestBot&gt;');
    expect(html).toContain('/admin/research');
    expect(html).toContain('Nothing has been applied');
  });
});
