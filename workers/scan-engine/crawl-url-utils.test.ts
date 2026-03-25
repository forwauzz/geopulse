import { describe, expect, it } from 'vitest';
import { normalizeUrlKey, pathSectionKey, prioritizeUrlsBySection } from './crawl-url-utils';

describe('pathSectionKey', () => {
  it('uses first segment', () => {
    expect(pathSectionKey('/blog/post')).toBe('/blog');
    expect(pathSectionKey('/')).toBe('/');
  });
});

describe('prioritizeUrlsBySection', () => {
  it('puts seed first and respects limit', () => {
    const seed = 'https://example.com/';
    const list = [
      seed,
      'https://example.com/about',
      'https://example.com/blog/a',
      'https://example.com/blog/b',
      'https://example.com/contact',
    ];
    const out = prioritizeUrlsBySection(seed, list, 4);
    expect(out[0]).toBe(seed);
    expect(out.length).toBe(4);
  });
});
