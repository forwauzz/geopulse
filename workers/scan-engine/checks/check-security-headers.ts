import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

const EXPECTED_HEADERS = [
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
] as const;

export const securityHeadersCheck: AuditCheck = {
  id: 'security-headers',
  name: 'Security response headers',
  weight: 2,
  category: 'ai_readiness',
  run(ctx: CheckContext): CheckResult {
    const headers = ctx.responseHeaders;
    const present: string[] = [];
    const missing: string[] = [];

    for (const h of EXPECTED_HEADERS) {
      if (headers[h]) {
        present.push(h);
      } else {
        missing.push(h);
      }
    }

    if (missing.length === 0) {
      return {
        id: 'security-headers',
        passed: true,
        status: 'PASS',
        finding: `All expected security headers present: ${present.join(', ')}.`,
      };
    }

    const passed = missing.length <= 1;
    return {
      id: 'security-headers',
      passed,
      status: passed ? 'WARNING' : 'FAIL',
      finding: `Missing security headers: ${missing.join(', ')}. Present: ${present.length > 0 ? present.join(', ') : 'none'}.`,
      fix: `Add the missing security headers (${missing.join(', ')}) to strengthen your site's trust profile.`,
    };
  },
};
