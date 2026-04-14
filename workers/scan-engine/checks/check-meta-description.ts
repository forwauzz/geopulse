import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

const MIN = 50;
const MAX = 170;

export const metaDescriptionCheck: AuditCheck = {
  id: 'meta-description',
  name: 'Meta description',
  weight: 4,
  category: 'extractability',
  run(ctx: CheckContext): CheckResult {
    const d = ctx.signals.metaDescription?.trim() ?? '';
    const len = d.length;
    const passed = len >= MIN && len <= MAX;
    return {
      id: 'meta-description',
      passed,
      status: passed ? 'PASS' : 'FAIL',
      finding: passed
        ? `Meta description present (${String(len)} characters).`
        : len === 0
          ? 'Missing meta description.'
          : `Meta description ${len < MIN ? 'is too short' : 'is too long'} (${String(len)} characters).`,
      fix: 'Add a meta description that summarizes the page in one or two sentences.',
    };
  },
};
