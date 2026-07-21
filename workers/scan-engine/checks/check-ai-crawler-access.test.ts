import { describe, expect, it } from 'vitest';
import type { CheckContext } from '../../lib/interfaces/audit';
import { aiCrawlerAccessCheck } from './check-ai-crawler-access';

function ctx(robotsTxtContent: string): CheckContext {
  return {
    signals: {} as CheckContext['signals'],
    finalUrl: 'https://example.com/',
    textSample: '',
    robotsTxtContent,
    llmsTxtContent: '',
    responseHeaders: {},
  };
}

describe('ai-crawler-access (retrieval vs training — spec §2.1/§2.2)', () => {
  it('passes with no robots.txt', async () => {
    const r = await aiCrawlerAccessCheck.run(ctx(''));
    expect(r.status).toBe('PASS');
  });

  it('passes when only TRAINING bots are blocked (an IP choice, not a visibility failure)', async () => {
    const robots =
      'User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: Google-Extended\nDisallow: /\n\nUser-agent: CCBot\nDisallow: /';
    const r = await aiCrawlerAccessCheck.run(ctx(robots));
    expect(r.status).toBe('PASS');
  });

  it('fails when a retrieval agent is blocked, naming the destination consequence', async () => {
    const robots = 'User-agent: OAI-SearchBot\nDisallow: /';
    const r = await aiCrawlerAccessCheck.run(ctx(robots));
    expect(r.status).toBe('FAIL');
    expect(r.finding).toContain('OAI-SearchBot');
    expect(r.finding).toContain('ChatGPT');
    expect(r.fix).toContain('business choice');
  });

  it('fails when a wildcard block catches everything', async () => {
    const r = await aiCrawlerAccessCheck.run(ctx('User-agent: *\nDisallow: /'));
    expect(r.status).toBe('FAIL');
  });

  it('fails when conventional search bots are blocked', async () => {
    const r = await aiCrawlerAccessCheck.run(ctx('User-agent: Googlebot\nDisallow: /'));
    expect(r.status).toBe('FAIL');
    expect(r.finding).toContain('Googlebot');
  });

  it('warns (not fails) when only user-triggered fetchers are blocked', async () => {
    const robots = 'User-agent: ChatGPT-User\nDisallow: /\n\nUser-agent: Perplexity-User\nDisallow: /';
    const r = await aiCrawlerAccessCheck.run(ctx(robots));
    expect(r.status).toBe('WARNING');
    expect(r.passed).toBe(true);
  });

  it('passes a WordPress-style robots.txt that only disallows /wp-admin/', async () => {
    const robots = 'User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php';
    const r = await aiCrawlerAccessCheck.run(ctx(robots));
    expect(r.status).toBe('PASS');
  });
});
