/**
 * Marketing-tone translation layer for the free-scan scorecard.
 *
 * Principle 1 (OSS-REFACTOR-PLAN.md): the scorecard is MARKETING, not engineering.
 * This maps each technical check → plain-language, benefit-led copy. The original
 * technical finding/fix stays on the issue object and is surfaced in the (technical)
 * full audit report instead — not here.
 */

export type MarketingCheck = {
  /** Positive, plain-language name — shown in "what's working". */
  title: string;
  /** Problem-framed short headline — shown in "what's holding you back". */
  problem: string;
  /** One-line "why this matters for you" (used for gaps). */
  win: string; // shown when the check passes ("what's working")
  gap: string; // shown when it fails ("what this is costing you")
  /** Plain-language next step (scorecard fix plan). */
  action: string;
};

export const MARKETING_CHECKS: Record<string, MarketingCheck> = {
  'ai-crawler-access': {
    title: 'AI engines can reach your site',
    problem: 'AI engines are blocked from your site',
    win: 'The major AI engines are allowed to read your pages.',
    gap: "AI engines are being blocked from reading your site, so you can't show up in their answers.",
    action: 'Let the AI engines in (open up your robots file to them).',
  },
  'https-only': {
    title: 'Your site is secure',
    problem: "Your site isn't served securely",
    win: 'Your pages load securely — a basic trust signal AI looks for.',
    gap: "Your pages aren't served securely, which hurts how much AI trusts them.",
    action: 'Serve your whole site securely over HTTPS.',
  },
  'title-tag': {
    title: 'Your pages have clear titles',
    problem: 'Your page titles are unclear',
    win: 'Each page says what it is — the first thing AI reads.',
    gap: 'Your page titles are missing or unclear, so AI has to guess what each page is about.',
    action: 'Give every page a short, clear title that says what it is.',
  },
  'meta-description': {
    title: 'Your pages summarize themselves',
    problem: "Your pages don't summarize themselves",
    win: 'Your pages carry a short summary AI can use.',
    gap: "Your pages don't summarize themselves, so AI has less to work with.",
    action: 'Add a one-sentence summary to each page.',
  },
  canonical: {
    title: 'No duplicate-page confusion',
    problem: 'Duplicate pages may split your credit',
    win: 'AI knows which version of each page is the real one.',
    gap: 'AI may see duplicate versions of your pages and split your credit between them.',
    action: 'Point each page at its single "official" address.',
  },
  'robots-meta': {
    title: "You're visible to AI search",
    problem: "You're hiding pages from AI by accident",
    win: "You're not accidentally hiding pages from AI search.",
    gap: "Some pages are telling AI search to ignore them — you're hiding by accident.",
    action: 'Stop telling AI search to skip pages you actually want found.',
  },
  'snippet-eligibility': {
    title: 'AI is allowed to quote you',
    problem: "You're telling AI it can't quote you",
    win: 'AI can pull and show snippets from your pages.',
    gap: "You're telling AI it can't quote you, so it leaves your pages out of answers.",
    action: 'Allow AI to show excerpts from your pages.',
  },
  'open-graph': {
    title: 'Your links look great when shared',
    problem: 'Your links look bare when shared',
    win: 'Shared links show a proper title and description.',
    gap: 'Your links look bare when shared in chats and social, costing you clicks.',
    action: 'Add share-preview titles and descriptions.',
  },
  'json-ld': {
    title: 'You give AI structured hints',
    problem: "You're not giving AI structured hints",
    win: 'You hand AI structured data about your pages.',
    gap: "You're not giving AI structured hints, so it has to guess what your pages mean.",
    action: 'Add structured data that describes your pages to AI.',
  },
  'schema-types': {
    title: 'AI can tell what your business is',
    problem: "AI can't tell what your business is",
    win: 'AI can tell what kind of business and content you are.',
    gap: "AI can't tell what kind of business you are, so it rarely surfaces you for the right questions.",
    action: 'Label your content so AI knows what kind of business you are.',
  },
  'heading-structure': {
    title: 'Your pages are well organized',
    problem: 'Your pages lack a clear structure',
    win: 'Your pages have a clear structure AI can follow.',
    gap: 'Your pages lack a clear structure, making them hard for AI to follow.',
    action: 'Organize each page with one clear headline and tidy sub-sections.',
  },
  viewport: {
    title: 'Your site works on mobile',
    problem: "Your site isn't mobile-friendly",
    win: 'Your pages are mobile-friendly.',
    gap: "Your pages aren't set up for mobile, which drags down how you're ranked.",
    action: 'Make your pages mobile-friendly.',
  },
  'html-size': {
    title: 'Your pages load lean',
    problem: 'Your pages are heavy and slow',
    win: "Your pages aren't bloated — easy for AI to process.",
    gap: 'Your pages are heavy and slow for AI to process.',
    action: 'Trim page bloat so pages load and process faster.',
  },
  'internal-links': {
    title: 'Your pages connect to each other',
    problem: "Your pages don't link together",
    win: 'Your pages link together so AI can explore your site.',
    gap: "Your pages don't link together well, so AI struggles to discover the rest of your site.",
    action: 'Link your related pages to each other.',
  },
  'alt-text': {
    title: 'Your images are described',
    problem: 'Your images are invisible to AI',
    win: 'Your images carry descriptions AI and screen readers can use.',
    gap: 'Most of your images are invisible to AI because they have no description.',
    action: 'Add short descriptions to your images.',
  },
  'external-links': {
    title: 'You cite credible sources',
    problem: "You don't cite credible sources",
    win: 'You reference outside sources, which builds credibility.',
    gap: "You don't reference outside sources, which weakens your credibility with AI.",
    action: 'Link out to credible sources where it fits.',
  },
  freshness: {
    title: 'Your content shows it’s current',
    problem: "AI can't tell if your content is current",
    win: 'Your content shows when it was published or updated.',
    gap: "AI can't tell if your content is current, so it may favor fresher competitors.",
    action: 'Show published / updated dates on your content.',
  },
  'security-headers': {
    title: 'Your site sends trust signals',
    problem: "You're missing basic trust signals",
    win: 'Your site sends the basic security signals AI expects.',
    gap: 'Your site is missing basic security signals that build trust.',
    action: 'Turn on a few standard security signals.',
  },
  'llms-txt': {
    title: 'You guide AI to your best content',
    problem: "AI doesn't know your best pages",
    win: 'You point AI straight to your most important pages.',
    gap: "You're not telling AI which pages matter most, so it may miss your best content.",
    action: 'Add a short guide that points AI to your best pages.',
  },
  'eeat-signals': {
    title: 'AI can see who’s behind your content',
    problem: "AI can't see who's behind your site",
    win: 'AI can see the people and expertise behind your site.',
    gap: "AI can't tell who's behind your content, so it hesitates to cite you.",
    action: 'Show who you are — add author details and an About page.',
  },
  'llm-qa-pattern': {
    title: 'Your content answers real questions',
    problem: "Your pages don't answer real questions",
    win: 'Your pages are written as clear questions and answers AI can lift.',
    gap: "Your pages aren't written as answers AI can lift, so it skips you when people ask.",
    action: 'Write key pages as the questions your customers actually ask, with direct answers.',
  },
  'llm-extractability': {
    title: 'AI can pull clean answers from you',
    problem: 'Your answers are hard for AI to lift',
    win: 'AI can pull clean, standalone answers from your pages.',
    gap: 'Your answers are buried in long copy, so AI struggles to pull a clean quote.',
    action: 'Lead with the answer, then explain — make key facts easy to lift.',
  },
};

export const MARKETING_PILLARS: Record<string, { label: string; blurb: string }> = {
  ai_readiness: { label: 'Getting found', blurb: 'Can AI engines reach and read your pages?' },
  extractability: { label: 'Being understood', blurb: 'Can AI make clean sense of your content?' },
  trust: { label: 'Being trusted', blurb: 'Does AI see you as credible enough to cite?' },
  demand_coverage: { label: 'Showing up in answers', blurb: 'When people ask about your category, are you mentioned?' },
  conversion_readiness: { label: 'Turning visits into customers', blurb: 'Once AI sends someone, does the page convert?' },
};

/** Marketing verdict for the score hero. */
export function marketingVerdict(score: number): { headline: string; lede: string; tone: 'good' | 'warn' | 'crit' } {
  if (score >= 75)
    return {
      headline: "You're showing up",
      tone: 'good',
      lede: "AI engines can find, read, and trust your site. Tidy up the last few items below and you'll be hard to leave out of the answer.",
    };
  if (score >= 55)
    return {
      headline: "You're on the map — but easy to overlook",
      tone: 'warn',
      lede: "AI engines can reach you, but they're not confident enough to put you front and center. A few focused changes could get you mentioned far more often.",
    };
  if (score >= 35)
    return {
      headline: "You're getting missed",
      tone: 'crit',
      lede: "Right now AI engines struggle to understand and trust your site, so they rarely surface you. The good news: the moves below are mostly quick wins.",
    };
  return {
    headline: "You're invisible to AI search",
    tone: 'crit',
    lede: "AI engines can barely see or make sense of your site today, so you're being left out of answers. Start with the plan below — the first few fixes move the needle fast.",
  };
}
