import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

const MIN = 10;
const MAX = 70;

export const titleTagCheck: AuditCheck = {
  id: 'title-tag',
  name: 'Title tag',
  weight: 4,
  category: 'extractability',
  run(ctx: CheckContext): CheckResult {
    const t = ctx.signals.title?.trim() ?? '';
    const len = t.length;
    const passed = len >= MIN && len <= MAX;
    return {
      id: 'title-tag',
      passed,
      status: passed ? 'PASS' : 'FAIL',
      finding: passed
        ? `Title length looks reasonable (${String(len)} characters).`
        : len === 0
          ? 'Missing <title> tag.'
          : `Title is ${len < MIN ? 'too short' : 'too long'} (${String(len)} characters; aim for ${String(MIN)}-${String(MAX)}).`,
      fix: 'Add a concise, unique title that describes the page.',
    };
  },
};
