import { describe, expect, it, vi } from 'vitest';
import {
  publicSitemapResponse,
  renderPublicSitemapXml,
  unavailablePublicSitemapResponse,
} from './public-sitemap-response';

describe('public sitemap responses', () => {
  it('renders valid, escaped XML for canonical URLs', () => {
    const xml = renderPublicSitemapXml([
      {
        url: 'https://getgeopulse.com/blog/example?source=a&mode=b',
        lastModified: '2026-10-24T12:00:00.000Z',
        changeFrequency: 'monthly',
        priority: 0.8,
      },
    ]);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<loc>https://getgeopulse.com/blog/example?source=a&amp;mode=b</loc>');
    expect(xml).toContain('<lastmod>2026-10-24T12:00:00.000Z</lastmod>');
    expect(xml).toContain('<changefreq>monthly</changefreq>');
    expect(xml).toContain('<priority>0.8</priority>');
  });

  it('returns cacheable XML only for a readable inventory', async () => {
    const response = publicSitemapResponse([{ url: 'https://getgeopulse.com/blog/example' }]);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/xml; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=300');
    expect(await response.text()).toContain('https://getgeopulse.com/blog/example');
  });

  it('fails closed with a sanitized retry contract when inventory is unreadable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = unavailablePublicSitemapResponse(
      'blog',
      new Error('password=secret provider detail')
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Retry-After')).toBe('300');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(await response.text()).toBe('Service temporarily unavailable.\n');
    expect(consoleError).toHaveBeenCalledWith('[public-sitemap] inventory unavailable', {
      surface: 'blog',
      errorType: 'Error',
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('provider detail');
    consoleError.mockRestore();
  });
});
