/**
 * Page-tier prioritization (spec C12): not all pages matter equally. Findings on
 * money pages (services, pricing, contact, security content) surface before the
 * same findings on generic blog posts.
 */

export type PageTier = 'money' | 'supporting' | 'content';

const MONEY_PATTERNS =
  /\/(services?|solutions?|pricing|prices|plans|packages|engagement|contact(-us)?|get-a-quote|quote|book|schedule|security|cybersecurity|compliance|managed-[a-z-]+|it-support|support-plans)([/#?]|$)/i;

const CONTENT_PATTERNS = /\/(blog|news|articles?|insights?|resources|guides?|category|tag|author)([/#?]|$)/i;

export function classifyPageTier(url: string): PageTier {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  if (path === '/' || path === '') return 'money'; // the homepage sells
  if (MONEY_PATTERNS.test(path)) return 'money';
  if (CONTENT_PATTERNS.test(path)) return 'content';
  return 'supporting';
}

export const TIER_ORDER: Record<PageTier, number> = { money: 0, supporting: 1, content: 2 };

export const TIER_LABELS: Record<PageTier, string> = {
  money: 'Money page',
  supporting: 'Supporting page',
  content: 'Content page',
};

/** Stable sort: money pages first, then supporting, then content. */
export function sortPagesByTier<T extends { url: string }>(pages: readonly T[]): T[] {
  return [...pages].sort((a, b) => TIER_ORDER[classifyPageTier(a.url)] - TIER_ORDER[classifyPageTier(b.url)]);
}
