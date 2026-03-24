import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

const SOFT_MAX = 400_000;

export const htmlSizeCheck: AuditCheck = {
  id: 'html-size',
  name: 'HTML payload size',
  weight: 5,
  run(ctx: CheckContext): CheckResult {
    const n = ctx.signals.htmlCharLength;
    const passed = n <= SOFT_MAX;
    return {
      id: 'html-size',
      passed,
      finding: passed
        ? `HTML size within sampled bound (${String(n)} characters in sample).`
        : `Very large HTML (${String(n)}+ characters in sample) — may hurt parsing and TTFB.`,
      fix: 'Reduce HTML bloat, defer non-critical scripts, and simplify templates.',
    };
  },
};
