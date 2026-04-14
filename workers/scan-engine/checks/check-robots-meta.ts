import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

/** Heuristic: page should not blanket-block useful crawlers via meta robots. */
export const robotsMetaCheck: AuditCheck = {
  id: 'robots-meta',
  name: 'Robots meta (AI visibility)',
  weight: 7,
  category: 'ai_readiness',
  run(ctx: CheckContext): CheckResult {
    const r = ctx.signals.robotsMetaContent?.toLowerCase() ?? '';
    const noindex = r.includes('noindex');
    const blocked =
      noindex ||
      /\bnone\b/.test(r) ||
      (r.includes('noarchive') && r.includes('nosnippet'));
    const passed = !blocked;
    return {
      id: 'robots-meta',
      passed,
      status: passed ? 'PASS' : 'FAIL',
      finding: passed
        ? 'Meta robots does not appear to block indexing entirely.'
        : `Restrictive robots meta: "${r.slice(0, 120)}${r.length > 120 ? '…' : ''}"`,
      fix: 'Review robots meta — avoid noindex on pages you want discoverable in AI-assisted search.',
    };
  },
};
