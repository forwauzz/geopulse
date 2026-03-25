import { describe, expect, it } from 'vitest';
import { extractSameOriginLinks, normalizeUrlKey } from './crawl-url-utils';

describe('normalizeUrlKey', () => {
  it('lowercases host and strips fragment', () => {
    expect(normalizeUrlKey('HTTPS://Example.COM/path#frag')).toBe('https://example.com/path');
  });

  it('returns empty for non-http(s)', () => {
    expect(normalizeUrlKey('ftp://x.com/')).toBe('');
  });
});

describe('extractSameOriginLinks', () => {
  it('collects same-origin https links', () => {
    const html =
      '<a href="/a">a</a><a href="https://example.com/b">b</a><a href="https://other.com/x">x</a>';
    const links = extractSameOriginLinks(html, 'https://example.com/', 20);
    expect(links).toContain('https://example.com/a');
    expect(links).toContain('https://example.com/b');
    expect(links.some((u) => u.includes('other.com'))).toBe(false);
  });
});
