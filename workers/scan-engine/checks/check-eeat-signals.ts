/**
 * E-E-A-T / real trust evidence (spec §2.4 + C1).
 *
 * Two fixes over the old check:
 *   - Trust anchor is SEMANTIC: a Why Us / Team / Company / Our Story link counts —
 *     the literal "About page" requirement was a false positive generator.
 *   - Personal bylines are only expected where a reader expects an author (editorial
 *     content). A service page without a byline is a WARNING with context, not a FAIL.
 */
import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

function looksEditorial(ctx: CheckContext): boolean {
  const url = ctx.finalUrl.toLowerCase();
  if (/\/(blog|news|articles?|insights?|resources|guides?)\//.test(url)) return true;
  return Boolean(ctx.signals.publishedDate);
}

export const eeatSignalsCheck: AuditCheck = {
  id: 'eeat-signals',
  name: 'Trust evidence (E-E-A-T)',
  weight: 6,
  category: 'trust',
  run(ctx: CheckContext): CheckResult {
    const hasAuthor = ctx.signals.hasAuthorSignal;
    const hasTrustAnchor = ctx.signals.hasAboutLink;
    const editorial = looksEditorial(ctx);

    if (hasTrustAnchor && (hasAuthor || !editorial)) {
      return {
        id: 'eeat-signals',
        passed: true,
        status: 'PASS',
        finding: hasAuthor
          ? 'Identity page (About/Team/Why Us) and author attribution detected — the trust evidence AI engines look for before citing a source.'
          : 'Identity page (About/Team/Why Us) detected. Author bylines are not expected on this kind of page, so none is required.',
      };
    }

    if (hasTrustAnchor && editorial && !hasAuthor) {
      return {
        id: 'eeat-signals',
        passed: true,
        status: 'WARNING',
        finding:
          'This looks like editorial content (blog/article) without an author byline. Readers and AI engines expect to know who wrote expert content.',
        fix: 'Add a visible byline and schema.org author markup to articles and guides. Service pages do not need bylines.',
      };
    }

    return {
      id: 'eeat-signals',
      passed: false,
      status: 'FAIL',
      finding:
        'No identity page link found (About, Team, Company, Why Us, or Our Story). AI engines weigh whether a real, identifiable business stands behind the content.',
      fix: 'Link every page to an identity page — About, Team, or Why Us — that names the business, the people, and credentials (certifications, years in business, partners).',
    };
  },
};
