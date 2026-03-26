import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

export const snippetEligibilityCheck: AuditCheck = {
  id: 'snippet-eligibility',
  name: 'Snippet eligibility',
  weight: 6,
  category: 'extractability',
  run(ctx: CheckContext): CheckResult {
    const xRobotsTag = (ctx.responseHeaders['x-robots-tag'] ?? '').toLowerCase();
    const metaRestriction = ctx.signals.hasSnippetRestriction;
    const headerRestriction =
      xRobotsTag.includes('nosnippet') || /max-snippet\s*[:=]\s*0/.test(xRobotsTag);

    if (!metaRestriction && !headerRestriction) {
      return {
        id: 'snippet-eligibility',
        passed: true,
        status: 'PASS',
        finding: 'No snippet restrictions detected — AI models can extract and display content excerpts.',
      };
    }

    const sources: string[] = [];
    if (metaRestriction) sources.push('meta robots tag');
    if (headerRestriction) sources.push('X-Robots-Tag header');

    return {
      id: 'snippet-eligibility',
      passed: false,
      status: 'FAIL',
      finding: `Snippet restrictions found in ${sources.join(' and ')} — AI search may not be able to show excerpts from your pages.`,
      fix: 'Remove nosnippet and max-snippet=0 directives from pages you want AI models to cite. Use max-snippet with a reasonable character limit instead of blocking entirely.',
    };
  },
};
