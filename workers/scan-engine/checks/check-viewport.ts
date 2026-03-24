import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

export const viewportCheck: AuditCheck = {
  id: 'viewport',
  name: 'Mobile viewport',
  weight: 5,
  run(ctx: CheckContext): CheckResult {
    const passed = ctx.signals.hasViewportMeta;
    return {
      id: 'viewport',
      passed,
      finding: passed ? 'Viewport meta tag is present.' : 'Missing viewport meta for mobile layout.',
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    };
  },
};
