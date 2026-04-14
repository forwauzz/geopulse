import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

export const eeatSignalsCheck: AuditCheck = {
  id: 'eeat-signals',
  name: 'E-E-A-T signals (authorship & trust)',
  weight: 6,
  category: 'trust',
  run(ctx: CheckContext): CheckResult {
    const hasAuthor = ctx.signals.hasAuthorSignal;
    const hasAbout = ctx.signals.hasAboutLink;

    if (hasAuthor && hasAbout) {
      return {
        id: 'eeat-signals',
        passed: true,
        status: 'PASS',
        finding: 'Author attribution and About page link detected — strong trust signals for AI models evaluating source credibility.',
      };
    }

    const missing: string[] = [];
    if (!hasAuthor) missing.push('author attribution (byline, meta author, or schema.org author)');
    if (!hasAbout) missing.push('link to an About page');

    return {
      id: 'eeat-signals',
      passed: false,
      status: 'FAIL',
      finding: `Missing ${missing.join(' and ')} — AI models weigh source credibility when selecting content to cite.`,
      fix: 'Add author markup (meta name="author", schema.org Person, or a visible byline) and ensure your site links to an About page that establishes expertise and authority.',
    };
  },
};
