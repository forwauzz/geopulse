import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

export const llmsTxtCheck: AuditCheck = {
  id: 'llms-txt',
  name: 'llms.txt presence',
  weight: 6,
  category: 'ai_readiness',
  run(ctx: CheckContext): CheckResult {
    const content = ctx.llmsTxtContent;
    if (content && content.trim().length > 0) {
      return {
        id: 'llms-txt',
        passed: true,
        status: 'PASS',
        finding: `llms.txt found (${String(content.trim().length)} chars) — AI models have structured guidance for your site.`,
      };
    }

    return {
      id: 'llms-txt',
      passed: false,
      status: 'FAIL',
      finding: 'No /llms.txt file found at the root of your domain.',
      fix: 'Create and publish an /llms.txt file that describes your site, key content areas, and preferred citation format for AI models.',
    };
  },
};
