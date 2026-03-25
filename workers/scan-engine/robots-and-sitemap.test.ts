import { describe, expect, it } from 'vitest';
import {
  crawlDelayMsFromRobotsSeconds,
  isPathAllowedByRobots,
  parseRobotsTxt,
  parseSitemapLocs,
} from './robots-and-sitemap';

describe('parseRobotsTxt', () => {
  it('parses User-agent * disallow and sitemap', () => {
    const text = `
User-agent: *
Disallow: /admin
Disallow: /private

Sitemap: https://example.com/sitemap.xml
`;
    const r = parseRobotsTxt(text);
    expect(r.disallows).toContain('/admin');
    expect(r.sitemapUrls).toContain('https://example.com/sitemap.xml');
  });

  it('parses disallow before any user-agent as global', () => {
    const text = 'Disallow: /secret\nUser-agent: Googlebot\nDisallow: /';
    const r = parseRobotsTxt(text);
    expect(r.disallows.some((d) => d === '/secret')).toBe(true);
  });
});

describe('isPathAllowedByRobots', () => {
  it('blocks prefix matches', () => {
    expect(isPathAllowedByRobots('/admin/foo', ['/admin'])).toBe(false);
    expect(isPathAllowedByRobots('/ok', ['/admin'])).toBe(true);
  });
});

describe('crawlDelayMsFromRobotsSeconds', () => {
  it('caps delay at 10s', () => {
    expect(crawlDelayMsFromRobotsSeconds(2)).toBe(2000);
    expect(crawlDelayMsFromRobotsSeconds(120)).toBe(10_000);
    expect(crawlDelayMsFromRobotsSeconds(null)).toBe(0);
  });
});

describe('parseSitemapLocs', () => {
  it('extracts locs', () => {
    const xml = '<urlset><loc>https://a.com/1</loc><loc>https://a.com/2</loc></urlset>';
    expect(parseSitemapLocs(xml, 10)).toEqual(['https://a.com/1', 'https://a.com/2']);
  });
});
