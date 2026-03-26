import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

const AI_BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot', 'anthropic-ai', 'Google-Extended'] as const;

function parseBlockedBots(robotsTxt: string): string[] {
  if (!robotsTxt) return [];

  const blocked: string[] = [];
  const lines = robotsTxt.split(/\r?\n/);
  let currentAgent = '';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const agentMatch = /^user-agent:\s*(.+)/i.exec(line);
    if (agentMatch) {
      currentAgent = agentMatch[1]?.trim().toLowerCase() ?? '';
      continue;
    }

    const disallowMatch = /^disallow:\s*\/?\s*$/i.exec(line) === null && /^disallow:\s*\//i.test(line);
    const disallowAll = /^disallow:\s*\/\s*$/i.test(line);

    if (disallowAll) {
      for (const bot of AI_BOTS) {
        if (currentAgent === bot.toLowerCase() || currentAgent === '*') {
          if (currentAgent === '*') {
            const hasSpecificAllow = lines.some((l) => {
              const a = /^user-agent:\s*(.+)/i.exec(l.trim());
              return a && AI_BOTS.some((b) => b.toLowerCase() === a[1]?.trim().toLowerCase());
            });
            if (hasSpecificAllow) continue;
          }
          if (!blocked.includes(bot) && currentAgent !== '*') blocked.push(bot);
          if (currentAgent === '*' && !blocked.includes(bot)) blocked.push(bot);
        }
      }
    }

    if (disallowMatch && !disallowAll) {
      for (const bot of AI_BOTS) {
        if (currentAgent === bot.toLowerCase()) {
          if (!blocked.includes(bot)) blocked.push(bot);
        }
      }
    }
  }

  return blocked;
}

export const aiCrawlerAccessCheck: AuditCheck = {
  id: 'ai-crawler-access',
  name: 'AI crawler access (robots.txt)',
  weight: 10,
  category: 'ai_readiness',
  run(ctx: CheckContext): CheckResult {
    if (!ctx.robotsTxtContent) {
      return {
        id: 'ai-crawler-access',
        passed: true,
        status: 'PASS',
        finding: 'No robots.txt found — AI crawlers are not explicitly blocked.',
      };
    }

    const blocked = parseBlockedBots(ctx.robotsTxtContent);
    if (blocked.length === 0) {
      return {
        id: 'ai-crawler-access',
        passed: true,
        status: 'PASS',
        finding: 'robots.txt does not block any known AI crawler user-agents.',
      };
    }

    return {
      id: 'ai-crawler-access',
      passed: false,
      status: 'FAIL',
      finding: `robots.txt blocks ${blocked.join(', ')} — these AI crawlers cannot index your site.`,
      fix: `Update robots.txt to allow AI crawlers you want to discover your content. Remove or modify Disallow rules for: ${blocked.join(', ')}.`,
    };
  },
};
