import { describe, expect, it } from 'vitest';
import { buildScanProgress } from './scan-progress';

describe('buildScanProgress', () => {
  it('reports 100% once the report is delivered', () => {
    const p = buildScanProgress({ pageLimit: 10, pagesDone: 10, latestPageUrl: null, reportDelivered: true });
    expect(p.percent).toBe(100);
    expect(p.phase).toBe('finishing');
  });

  it('scales crawl progress into the 5-90 band with the current URL as detail', () => {
    const p = buildScanProgress({
      pageLimit: 10,
      pagesDone: 5,
      latestPageUrl: 'https://mipsmedia.com/cloud',
      reportDelivered: false,
    });
    expect(p.phase).toBe('crawling');
    expect(p.percent).toBeGreaterThanOrEqual(40);
    expect(p.percent).toBeLessThanOrEqual(55);
    expect(p.detail).toBe('Reviewing https://mipsmedia.com/cloud');
  });

  it('holds at 90 while scoring and assembling after the crawl finishes', () => {
    const p = buildScanProgress({ pageLimit: 10, pagesDone: 10, latestPageUrl: 'x', reportDelivered: false });
    expect(p.percent).toBe(90);
    expect(p.phase).toBe('finishing');
    expect(p.detail).toMatch(/assembling/i);
  });

  it('degrades honestly when no page limit is known', () => {
    const p = buildScanProgress({ pageLimit: null, pagesDone: 0, latestPageUrl: null, reportDelivered: false });
    expect(p.phase).toBe('unknown');
    expect(p.percent).toBeLessThanOrEqual(10);
  });

  it('never exceeds the crawl band even if more pages than the limit appear', () => {
    const p = buildScanProgress({ pageLimit: 10, pagesDone: 14, latestPageUrl: 'x', reportDelivered: false });
    expect(p.percent).toBe(90);
  });
});
