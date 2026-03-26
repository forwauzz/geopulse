import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

export const freshnessCheck: AuditCheck = {
  id: 'freshness',
  name: 'Content freshness signals',
  weight: 3,
  category: 'trust',
  run(ctx: CheckContext): CheckResult {
    const pubDate = parseDate(ctx.signals.publishedDate);
    const modDate = parseDate(ctx.signals.modifiedDate);
    const latest = modDate ?? pubDate;

    if (!latest) {
      return {
        id: 'freshness',
        passed: false,
        status: 'FAIL',
        finding: 'No publication or modification date detected — AI models may deprioritize content with unknown freshness.',
        fix: 'Add article:published_time / article:modified_time meta tags or datePublished / dateModified in JSON-LD.',
      };
    }

    const ageMs = Date.now() - latest.getTime();
    if (ageMs > ONE_YEAR_MS) {
      return {
        id: 'freshness',
        passed: false,
        status: 'WARNING',
        finding: `Content last updated over a year ago (${latest.toISOString().split('T')[0]}) — AI models favor recent content.`,
        fix: 'Review and update content regularly; ensure dateModified reflects the latest revision.',
      };
    }

    return {
      id: 'freshness',
      passed: true,
      status: 'PASS',
      finding: `Content date signal found: ${latest.toISOString().split('T')[0]} — within the last year.`,
    };
  },
};
