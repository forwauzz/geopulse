import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

export const httpsOnlyCheck: AuditCheck = {
  id: 'https-only',
  name: 'HTTPS URL',
  weight: 4,
  category: 'ai_readiness',
  run(ctx: CheckContext): CheckResult {
    const passed = ctx.finalUrl.startsWith('https://');
    return {
      id: 'https-only',
      passed,
      status: passed ? 'PASS' : 'FAIL',
      finding: passed
        ? 'Page is loaded over HTTPS.'
        : 'Final URL is not served over HTTPS.',
      fix: passed ? undefined : 'Serve the site over HTTPS and redirect HTTP to HTTPS.',
    };
  },
};
