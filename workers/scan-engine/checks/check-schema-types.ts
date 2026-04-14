import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

const VALUABLE_TYPES = new Set([
  'Organization', 'WebSite', 'WebPage', 'Article', 'NewsArticle', 'BlogPosting',
  'FAQPage', 'HowTo', 'Product', 'BreadcrumbList', 'LocalBusiness',
  'Person', 'Event', 'Recipe', 'Review', 'Course', 'SoftwareApplication',
]);

export const schemaTypesCheck: AuditCheck = {
  id: 'schema-types',
  name: 'Schema.org type coverage',
  weight: 4,
  category: 'extractability',
  run(ctx: CheckContext): CheckResult {
    const types = ctx.signals.jsonLdTypes;
    if (types.length === 0) {
      return {
        id: 'schema-types',
        passed: false,
        status: 'FAIL',
        finding: 'No Schema.org @type values found in JSON-LD.',
        fix: 'Add JSON-LD with descriptive @type (e.g. Organization, Article, FAQPage) so AI models understand your content type.',
      };
    }

    const matched = types.filter((t) => VALUABLE_TYPES.has(t));
    if (matched.length === 0) {
      return {
        id: 'schema-types',
        passed: false,
        status: 'WARNING',
        finding: `JSON-LD present with types [${types.join(', ')}] — none are high-value for AI search extraction.`,
        fix: 'Use specific Schema.org types like Article, FAQPage, HowTo, or Product for richer AI understanding.',
      };
    }

    return {
      id: 'schema-types',
      passed: true,
      status: 'PASS',
      finding: `Useful Schema.org types detected: ${matched.join(', ')}.`,
    };
  },
};
