import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

export const openGraphCheck: AuditCheck = {
  id: 'open-graph',
  name: 'Open Graph basics',
  weight: 8,
  run(ctx: CheckContext): CheckResult {
    const hasTitle = Boolean(ctx.signals.ogTitle?.trim());
    const hasDesc = Boolean(ctx.signals.ogDescription?.trim());
    const passed = hasTitle && hasDesc;
    return {
      id: 'open-graph',
      passed,
      finding: passed
        ? 'og:title and og:description are present.'
        : `Missing Open Graph tags: ${!hasTitle ? 'og:title ' : ''}${!hasDesc ? 'og:description' : ''}`.trim(),
      fix: 'Add og:title and og:description for richer link previews.',
    };
  },
};
