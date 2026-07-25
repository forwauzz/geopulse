import { describe, expect, it, vi } from 'vitest';
import {
  buildGoogleSearchConsoleAuthorizeUrl,
  fetchDataForSeoRankResult,
  fetchSearchConsoleRows,
  queueDataForSeoRanks,
} from './seo-providers';

describe('SEO providers', () => {
  it('builds least-privilege offline Google authorization', () => {
    const url = new URL(buildGoogleSearchConsoleAuthorizeUrl({
      clientId: 'client',
      redirectUri: 'https://getgeopulse.com/api/connectors/google-search-console/callback',
      state: 'signed',
    }));
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/webmasters.readonly');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('state')).toBe('signed');
  });

  it('normalizes Search Console query rows', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      rows: [{ keys: ['ai visibility', 'https://getgeopulse.com/'], clicks: 2, impressions: 40, ctr: 0.05, position: 8.2 }],
    }), { status: 200 }));
    const rows = await fetchSearchConsoleRows({
      accessToken: 'token',
      siteUrl: 'sc-domain:getgeopulse.com',
      startDate: '2026-07-01',
      endDate: '2026-07-20',
    }, fetcher as typeof fetch);
    expect(rows).toEqual([{
      query: 'ai visibility',
      page: 'https://getgeopulse.com/',
      clicks: 2,
      impressions: 40,
      ctr: 0.05,
      position: 8.2,
    }]);
  });

  it('uses normal-priority top-ten SERP tasks only', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body[0]).toMatchObject({ depth: 10, priority: 1, location_code: 2124 });
      return new Response(JSON.stringify({
        tasks: [{ id: 'task-1', cost: 0.0006, status_code: 20100, status_message: 'Task Created.' }],
      }), { status: 200 });
    });
    const tasks = await queueDataForSeoRanks({
      login: 'login',
      password: 'password',
      domain: 'getgeopulse.com',
      keywords: [{ keywordId: 'keyword-1', keyword: 'ai visibility' }],
    }, fetcher as typeof fetch);
    expect(tasks[0]).toMatchObject({ id: 'task-1', cost: 0.0006, keywordId: 'keyword-1' });
  });

  it('extracts own rank and bounded competitors', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      tasks: [{
        id: 'task-1',
        result: [{
          items: [
            { type: 'organic', domain: 'example.com', rank_absolute: 1, url: 'https://example.com' },
            { type: 'organic', domain: 'getgeopulse.com', rank_absolute: 2, url: 'https://getgeopulse.com' },
          ],
        }],
      }],
    }), { status: 200 }));
    const result = await fetchDataForSeoRankResult({
      login: 'login',
      password: 'password',
      taskId: 'task-1',
      domain: 'getgeopulse.com',
    }, fetcher as typeof fetch);
    expect(result.position).toBe(2);
    expect(result.competitors).toEqual([{ domain: 'example.com', position: 1, url: 'https://example.com' }]);
  });
});
