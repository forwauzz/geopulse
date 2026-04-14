import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

export const headingStructureCheck: AuditCheck = {
  id: 'heading-structure',
  name: 'Heading structure',
  weight: 5,
  category: 'extractability',
  run(ctx: CheckContext): CheckResult {
    const h1 = ctx.signals.h1Count;
    const passed = h1 === 1;
    return {
      id: 'heading-structure',
      passed,
      status: passed ? 'PASS' : 'FAIL',
      finding:
        h1 === 0
          ? 'No H1 found.'
          : h1 === 1
            ? 'Exactly one H1 — good baseline for structure.'
            : `Multiple H1 tags (${String(h1)}) — prefer a single primary heading.`,
      fix: 'Use one clear H1 and organize supporting content with H2/H3.',
    };
  },
};
