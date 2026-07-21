/**
 * Retrieval-agent access check (spec §2.1/§2.2).
 *
 * FAILS only when a bot that gates live AI visibility is blocked:
 *   - retrieval agents (OAI-SearchBot, Claude-SearchBot, PerplexityBot), or
 *   - conventional search bots (Googlebot, Bingbot) that AI surfaces build on.
 *
 * Blocking TRAINING crawlers (GPTBot, ClaudeBot, Google-Extended, …) is a legitimate
 * IP/business choice with no effect on live citation — it must never fail this check.
 * User-triggered fetchers being blocked is surfaced as a WARNING, not a failure.
 */
import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';
import { agentsByFamily } from '../agent-registry';
import { evaluateRobotsForToken } from '../robots-evaluator';

export const aiCrawlerAccessCheck: AuditCheck = {
  id: 'ai-crawler-access',
  name: 'AI retrieval agent access (robots.txt)',
  weight: 10,
  category: 'ai_readiness',
  run(ctx: CheckContext): CheckResult {
    if (!ctx.robotsTxtContent) {
      return {
        id: 'ai-crawler-access',
        passed: true,
        status: 'PASS',
        finding:
          'No robots.txt restrictions found — AI search agents (OAI-SearchBot, Claude-SearchBot, PerplexityBot) can reach the site.',
      };
    }

    const gate = [...agentsByFamily('retrieval'), ...agentsByFamily('conventional_search')];
    const blockedGate = gate.filter(
      (a) => !evaluateRobotsForToken(ctx.robotsTxtContent, a.token, '/').allowed
    );
    const blockedFetchers = agentsByFamily('user_fetcher').filter(
      (a) => !evaluateRobotsForToken(ctx.robotsTxtContent, a.token, '/').allowed
    );

    if (blockedGate.length > 0) {
      const names = blockedGate.map((a) => a.token).join(', ');
      const consequences = blockedGate.map((a) => a.blockConsequence).join(' ');
      return {
        id: 'ai-crawler-access',
        passed: false,
        status: 'FAIL',
        finding: `robots.txt blocks ${names}. ${consequences}`,
        fix:
          `Allow the AI search agents in robots.txt (these gate whether AI engines can cite you): ${names}. ` +
          'Training bots like GPTBot or Google-Extended are a separate business choice — blocking those does NOT hide you from AI search.',
      };
    }

    if (blockedFetchers.length > 0) {
      const names = blockedFetchers.map((a) => a.token).join(', ');
      return {
        id: 'ai-crawler-access',
        passed: true,
        status: 'WARNING',
        finding:
          `All AI search agents are allowed, but robots.txt blocks ${names} — these fetch a page only when a real user asks an AI assistant about it, so blocking them breaks requests your prospects make.`,
        fix: `Consider allowing ${names}; these are user-triggered fetches, not crawlers.`,
      };
    }

    return {
      id: 'ai-crawler-access',
      passed: true,
      status: 'PASS',
      finding:
        'robots.txt allows all AI search agents (OAI-SearchBot, Claude-SearchBot, PerplexityBot) and conventional search bots.',
    };
  },
};
