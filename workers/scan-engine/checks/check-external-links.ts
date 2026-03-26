import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

const MIN_EXTERNAL = 1;

export const externalLinksCheck: AuditCheck = {
  id: 'external-links',
  name: 'External authority links',
  weight: 3,
  category: 'trust',
  run(ctx: CheckContext): CheckResult {
    const n = ctx.signals.externalLinkCount;
    const passed = n >= MIN_EXTERNAL;

    if (passed) {
      return {
        id: 'external-links',
        passed: true,
        status: 'PASS',
        finding: `${String(n)} external link(s) detected — references to external sources strengthen credibility for AI models.`,
      };
    }

    return {
      id: 'external-links',
      passed: false,
      status: 'FAIL',
      finding: 'No external links found — AI models use outbound references as a trust signal.',
      fix: 'Link to authoritative external sources, research, or references that support your claims.',
    };
  },
};
