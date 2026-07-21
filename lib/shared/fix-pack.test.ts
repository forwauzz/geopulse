import { describe, expect, it } from 'vitest';
import { buildCloudflareBotSafelist, buildCloudflareSecurityHeaders, buildRobotsTxt } from './fix-pack';
import { evaluateRobotsForToken } from '../../workers/scan-engine/robots-evaluator';

describe('buildRobotsTxt (spec C10) — validated with the scanner`s own evaluator', () => {
  it('always allows retrieval agents and search bots, regardless of training choice', () => {
    for (const choice of ['allow', 'block'] as const) {
      const robots = buildRobotsTxt({ domain: 'example.com', trainingChoice: choice });
      for (const token of ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'Googlebot', 'Bingbot', 'ChatGPT-User', 'Claude-User']) {
        expect(evaluateRobotsForToken(robots, token, '/').allowed, `${token} with training=${choice}`).toBe(true);
      }
    }
  });

  it('reflects the owner`s training choice', () => {
    const blocked = buildRobotsTxt({ domain: 'example.com', trainingChoice: 'block' });
    for (const token of ['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot']) {
      expect(evaluateRobotsForToken(blocked, token, '/').allowed, token).toBe(false);
    }
    const allowed = buildRobotsTxt({ domain: 'example.com', trainingChoice: 'allow' });
    for (const token of ['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot']) {
      expect(evaluateRobotsForToken(allowed, token, '/').allowed, token).toBe(true);
    }
  });

  it('explains the training section in plain English and includes the sitemap', () => {
    const robots = buildRobotsTxt({ domain: 'example.com', trainingChoice: 'block' });
    expect(robots).toContain('does NOT affect');
    expect(robots).toContain('business/IP decision');
    expect(robots).toContain('Sitemap: https://example.com/sitemap.xml');
    expect(robots).toContain('Bytespider ignores robots.txt');
  });
});

describe('Cloudflare artifacts', () => {
  it('safelist expression covers every retrieval agent and verified bots', () => {
    const s = buildCloudflareBotSafelist();
    expect(s.expression).toContain('cf.client.bot');
    for (const token of ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'Bingbot']) {
      expect(s.expression).toContain(token);
    }
    expect(s.steps.length).toBeGreaterThan(3);
  });

  it('security headers artifact stays framed as hygiene', () => {
    const h = buildCloudflareSecurityHeaders();
    expect(h.headers.map((x) => x.name)).toEqual([
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
    ]);
    expect(h.note).toContain('does not change AI visibility');
  });
});
