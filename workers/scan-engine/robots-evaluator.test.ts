import { describe, expect, it } from 'vitest';
import { evaluateRobotsForToken, parseRobotsTxt } from './robots-evaluator';

describe('parseRobotsTxt', () => {
  it('groups consecutive user-agent lines into one group', () => {
    const groups = parseRobotsTxt(
      'User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nAllow: /'
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]?.agents).toEqual(['gptbot', 'claudebot']);
    expect(groups[0]?.rules).toEqual([{ type: 'disallow', path: '/' }]);
  });

  it('strips comments and blank lines', () => {
    const groups = parseRobotsTxt('# hi\nUser-agent: * # all\nDisallow: /admin # private\n');
    expect(groups[0]?.rules[0]?.path).toBe('/admin');
  });
});

describe('evaluateRobotsForToken', () => {
  it('allows everything when robots.txt is empty', () => {
    const v = evaluateRobotsForToken('', 'OAI-SearchBot');
    expect(v.allowed).toBe(true);
    expect(v.matchedGroup).toBe('none');
  });

  it('blocks a token with a specific Disallow: /', () => {
    const v = evaluateRobotsForToken('User-agent: PerplexityBot\nDisallow: /', 'PerplexityBot');
    expect(v.allowed).toBe(false);
    expect(v.matchedGroup).toBe('specific');
    expect(v.decidingRule).toBe('Disallow: /');
  });

  it('a specific group overrides the wildcard group (specific allow wins)', () => {
    const robots = 'User-agent: *\nDisallow: /\n\nUser-agent: OAI-SearchBot\nAllow: /';
    expect(evaluateRobotsForToken(robots, 'OAI-SearchBot').allowed).toBe(true);
    expect(evaluateRobotsForToken(robots, 'Googlebot').allowed).toBe(false);
  });

  it('a specific empty-disallow group means allowed', () => {
    const robots = 'User-agent: GPTBot\nDisallow:\n\nUser-agent: *\nDisallow: /';
    expect(evaluateRobotsForToken(robots, 'GPTBot').allowed).toBe(true);
  });

  it('wildcard block applies to tokens without a specific group', () => {
    const robots = 'User-agent: *\nDisallow: /';
    const v = evaluateRobotsForToken(robots, 'Claude-SearchBot');
    expect(v.allowed).toBe(false);
    expect(v.matchedGroup).toBe('wildcard');
  });

  it('longest path match wins; Allow beats Disallow on ties', () => {
    const robots = 'User-agent: *\nDisallow: /private\nAllow: /';
    expect(evaluateRobotsForToken(robots, 'Googlebot', '/').allowed).toBe(true);
    expect(evaluateRobotsForToken(robots, 'Googlebot', '/private/x').allowed).toBe(false);
  });

  it('path-scoped disallow does not block the root', () => {
    const robots = 'User-agent: GPTBot\nDisallow: /wp-admin/';
    expect(evaluateRobotsForToken(robots, 'GPTBot', '/').allowed).toBe(true);
  });

  it('is case-insensitive on user-agent tokens', () => {
    const robots = 'User-agent: gptbot\nDisallow: /';
    expect(evaluateRobotsForToken(robots, 'GPTBot').allowed).toBe(false);
  });

  it('merges rules from multiple groups naming the same token', () => {
    const robots =
      'User-agent: GPTBot\nDisallow: /a\n\nUser-agent: GPTBot\nDisallow: /';
    expect(evaluateRobotsForToken(robots, 'GPTBot', '/').allowed).toBe(false);
  });

  it('matches vendor prefixes only at a dash boundary', () => {
    const robots = 'User-agent: Claude\nDisallow: /';
    expect(evaluateRobotsForToken(robots, 'Claude-SearchBot').allowed).toBe(false);
    // "Google" must not capture "Googlebot" (no dash boundary).
    const g = 'User-agent: Google\nDisallow: /';
    expect(evaluateRobotsForToken(g, 'Googlebot').allowed).toBe(true);
    expect(evaluateRobotsForToken(g, 'Google-Extended').allowed).toBe(false);
  });

  it('ignores a malformed empty User-agent value', () => {
    const robots = 'User-agent:\nDisallow: /\n\nUser-agent: *\nAllow: /';
    expect(evaluateRobotsForToken(robots, 'Googlebot').allowed).toBe(true);
  });

  it('supports wildcard and anchor patterns', () => {
    const robots = 'User-agent: *\nDisallow: /*.pdf$';
    expect(evaluateRobotsForToken(robots, 'Googlebot', '/x.pdf').allowed).toBe(false);
    expect(evaluateRobotsForToken(robots, 'Googlebot', '/x.html').allowed).toBe(true);
  });
});
