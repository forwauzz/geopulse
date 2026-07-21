/**
 * Multilingual / hreflang parity (spec C14) — directly relevant to bilingual markets
 * like Québec/Montréal, where EN/FR parity decides which audience can find you.
 *
 * The check is conditional by design: a monolingual site with no hreflang is fine
 * (PASS with a note); once hreflang annotations exist, they must be coherent.
 */
import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

export interface HreflangEntry {
  lang: string;
  href: string;
}

export function evaluateHreflang(input: {
  entries: HreflangEntry[];
  finalUrl: string;
  htmlLang: string | null;
}): { status: 'PASS' | 'FAIL' | 'WARNING'; finding: string; fix?: string } {
  const { entries, finalUrl, htmlLang } = input;

  if (entries.length === 0) {
    return {
      status: 'PASS',
      finding:
        'No hreflang annotations found — fine for a single-language site. If you serve both English and French audiences, hreflang tells engines which version to show whom.',
    };
  }

  const problems: string[] = [];

  // Self-reference: the page should list its own URL among the alternates.
  const normalize = (u: string) => u.replace(/[#?].*$/, '').replace(/\/$/, '');
  const listsSelf = entries.some((e) => normalize(e.href) === normalize(finalUrl));
  if (!listsSelf) {
    problems.push('the page does not list itself among its hreflang alternates (self-reference is required)');
  }

  const hasXDefault = entries.some((e) => e.lang === 'x-default');
  if (!hasXDefault) {
    problems.push('no x-default alternate (engines use it for unmatched languages)');
  }

  if (htmlLang) {
    const pageLang = htmlLang.toLowerCase().split('-')[0];
    const listsOwnLang = entries.some((e) => e.lang.split('-')[0] === pageLang);
    if (!listsOwnLang) {
      problems.push(`the page declares lang="${htmlLang}" but no hreflang alternate covers that language`);
    }
  }

  const dupes = entries.map((e) => e.lang).filter((l, i, arr) => arr.indexOf(l) !== i);
  if (dupes.length > 0) {
    problems.push(`duplicate hreflang values (${[...new Set(dupes)].join(', ')}) point engines at conflicting URLs`);
  }

  if (problems.length === 0) {
    return {
      status: 'PASS',
      finding: `hreflang annotations look coherent (${String(entries.length)} alternates incl. self-reference${hasXDefault ? ' and x-default' : ''}).`,
    };
  }

  const severe = !listsSelf || dupes.length > 0;
  return {
    status: severe ? 'FAIL' : 'WARNING',
    finding: `hreflang present but inconsistent: ${problems.join('; ')}.`,
    fix:
      'Each language version must list every alternate INCLUDING itself, add an x-default, and keep the set identical (reciprocal) across all versions. In WordPress, WPML/Polylang manage this automatically once configured.',
  };
}

export const hreflangCheck: AuditCheck = {
  id: 'hreflang-parity',
  name: 'Multilingual hreflang parity',
  weight: 2,
  category: 'ai_readiness',
  run(ctx: CheckContext): CheckResult {
    const result = evaluateHreflang({
      entries: ctx.signals.hreflangEntries ?? [],
      finalUrl: ctx.finalUrl,
      htmlLang: ctx.signals.htmlLang ?? null,
    });
    return {
      id: 'hreflang-parity',
      passed: result.status !== 'FAIL',
      status: result.status,
      finding: result.finding,
      fix: result.fix,
    };
  },
};
