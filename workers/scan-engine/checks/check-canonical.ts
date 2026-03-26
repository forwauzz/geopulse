import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

export const canonicalCheck: AuditCheck = {
  id: 'canonical',
  name: 'Canonical URL',
  weight: 4,
  category: 'ai_readiness',
  run(ctx: CheckContext): CheckResult {
    const c = ctx.signals.canonicalHref?.trim();
    const passed = Boolean(c && (c.startsWith('https://') || c.startsWith('/')));
    return {
      id: 'canonical',
      passed,
      status: passed ? 'PASS' : 'FAIL',
      finding: passed
        ? 'Canonical link is declared.'
        : 'No canonical link (rel=canonical) found.',
      fix: 'Add a canonical URL that matches your preferred URL for this content.',
    };
  },
};
