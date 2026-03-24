import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

export const jsonLdCheck: AuditCheck = {
  id: 'json-ld',
  name: 'Structured data (JSON-LD)',
  weight: 10,
  run(ctx: CheckContext): CheckResult {
    const n = ctx.signals.jsonLdSnippetCount;
    const passed = n > 0;
    return {
      id: 'json-ld',
      passed,
      finding: passed
        ? `Found ${String(n)} JSON-LD script block(s).`
        : 'No JSON-LD structured data detected.',
      fix: 'Add schema.org JSON-LD (Organization, WebSite, Article, etc.) where appropriate.',
    };
  },
};
