import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

const MIN_INTERNAL = 3;

export const internalLinksCheck: AuditCheck = {
  id: 'internal-links',
  name: 'Internal linking',
  weight: 6,
  category: 'extractability',
  run(ctx: CheckContext): CheckResult {
    const n = ctx.signals.internalLinkCount;
    const passed = n >= MIN_INTERNAL;
    return {
      id: 'internal-links',
      passed,
      status: passed ? 'PASS' : 'FAIL',
      finding: passed
        ? `${String(n)} internal links detected in sample.`
        : `Few internal links in sample (${String(n)}).`,
      fix: 'Link related pages so crawlers and models can discover your site structure.',
    };
  },
};
