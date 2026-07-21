/**
 * Versioned AI-crawler agent registry — the single source of truth for which bots exist,
 * which family they belong to, and what blocking each one actually does.
 *
 * The core distinction (spec §2.1): "AI crawlers" are NOT one thing.
 *   - retrieval agents gate CITATION in AI answers (blocking = invisible in that engine),
 *   - user fetchers serve a live request a human made (blocking breaks that request),
 *   - training crawlers only feed model training corpora (blocking = IP/business choice,
 *     with NO effect on live citation),
 *   - conventional search bots feed classic indexes that some AI surfaces build on.
 *
 * Data-driven and dated: verify tokens against the vendor docs below before bumping
 * AGENT_REGISTRY_VERSION. Names verified live on the version date.
 */

export const AGENT_REGISTRY_VERSION = '2026-07-21';

export type CrawlerFamily =
  | 'retrieval'
  | 'user_fetcher'
  | 'training'
  | 'conventional_search';

export interface RegisteredAgent {
  /** Exact robots.txt User-agent token. */
  token: string;
  vendor: string;
  family: CrawlerFamily;
  /** Whether the vendor documents this bot as honoring robots.txt. */
  respectsRobotsTxt: boolean;
  /** Vendor documentation used to verify the token (re-check when bumping the version). */
  docsUrl: string;
  /** Plain-English consequence of blocking this bot. */
  blockConsequence: string;
}

export const AGENT_REGISTRY: readonly RegisteredAgent[] = [
  // ── Retrieval / search agents — the visibility gate ────────────────────────
  {
    token: 'OAI-SearchBot',
    vendor: 'OpenAI',
    family: 'retrieval',
    respectsRobotsTxt: true,
    docsUrl: 'https://developers.openai.com/api/docs/bots',
    blockConsequence: 'Your site disappears from ChatGPT search results.',
  },
  {
    token: 'Claude-SearchBot',
    vendor: 'Anthropic',
    family: 'retrieval',
    respectsRobotsTxt: true,
    docsUrl: 'https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler',
    blockConsequence: 'Your site disappears from Claude search results.',
  },
  {
    token: 'PerplexityBot',
    vendor: 'Perplexity',
    family: 'retrieval',
    respectsRobotsTxt: true,
    docsUrl: 'https://docs.perplexity.ai/guides/bots',
    blockConsequence: 'Your site disappears from Perplexity answers.',
  },
  // ── User-triggered fetchers — serve a live human request ───────────────────
  {
    token: 'ChatGPT-User',
    vendor: 'OpenAI',
    family: 'user_fetcher',
    respectsRobotsTxt: false,
    docsUrl: 'https://developers.openai.com/api/docs/bots',
    blockConsequence: 'Breaks page fetches a ChatGPT user explicitly asked for.',
  },
  {
    token: 'Claude-User',
    vendor: 'Anthropic',
    family: 'user_fetcher',
    respectsRobotsTxt: true,
    docsUrl: 'https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler',
    blockConsequence: 'Breaks page fetches a Claude user explicitly asked for.',
  },
  {
    token: 'Perplexity-User',
    vendor: 'Perplexity',
    family: 'user_fetcher',
    respectsRobotsTxt: false,
    docsUrl: 'https://docs.perplexity.ai/guides/bots',
    blockConsequence: 'Breaks page fetches a Perplexity user explicitly asked for.',
  },
  // ── Training crawlers — an IP/business choice, NOT a visibility lever ──────
  {
    token: 'GPTBot',
    vendor: 'OpenAI',
    family: 'training',
    respectsRobotsTxt: true,
    docsUrl: 'https://developers.openai.com/api/docs/bots',
    blockConsequence: 'Opts your content out of OpenAI model training. Does not affect ChatGPT search visibility.',
  },
  {
    token: 'ClaudeBot',
    vendor: 'Anthropic',
    family: 'training',
    respectsRobotsTxt: true,
    docsUrl: 'https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler',
    blockConsequence: 'Opts your content out of Anthropic model training. Does not affect Claude search visibility.',
  },
  {
    token: 'anthropic-ai',
    vendor: 'Anthropic',
    family: 'training',
    respectsRobotsTxt: true,
    docsUrl: 'https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler',
    blockConsequence: 'Legacy Anthropic training token. Does not affect Claude search visibility.',
  },
  {
    token: 'Google-Extended',
    vendor: 'Google',
    family: 'training',
    respectsRobotsTxt: true,
    docsUrl: 'https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers',
    blockConsequence: 'Opts out of Gemini training and grounding. Google documents that it does NOT affect Google Search inclusion, ranking, or AI Overviews.',
  },
  {
    token: 'Google-CloudVertexBot',
    vendor: 'Google',
    family: 'training',
    respectsRobotsTxt: true,
    docsUrl: 'https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers',
    blockConsequence: 'Blocks site-owner-requested Vertex AI agent crawls. No effect on Google Search.',
  },
  {
    token: 'CCBot',
    vendor: 'Common Crawl',
    family: 'training',
    respectsRobotsTxt: true,
    docsUrl: 'https://commoncrawl.org/ccbot',
    blockConsequence: 'Opts out of the Common Crawl corpus many models train on. No effect on live AI answers.',
  },
  {
    token: 'Bytespider',
    vendor: 'ByteDance',
    family: 'training',
    respectsRobotsTxt: false,
    docsUrl: 'https://www.bytedance.com',
    blockConsequence: 'Known to ignore robots.txt — only a server/WAF rule actually stops it.',
  },
  // ── Conventional search — classic indexes that also feed AI surfaces ───────
  {
    token: 'Googlebot',
    vendor: 'Google',
    family: 'conventional_search',
    respectsRobotsTxt: true,
    docsUrl: 'https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers',
    blockConsequence: 'Broad Google Search invisibility — and AI Overviews eligibility depends on normal Googlebot indexability.',
  },
  {
    token: 'Bingbot',
    vendor: 'Microsoft',
    family: 'conventional_search',
    respectsRobotsTxt: true,
    docsUrl: 'https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0',
    blockConsequence: 'Bing/Copilot invisibility — and ChatGPT search still leans on the Bing index, especially for local queries.',
  },
];

export function agentsByFamily(family: CrawlerFamily): RegisteredAgent[] {
  return AGENT_REGISTRY.filter((a) => a.family === family);
}

export function findAgent(token: string): RegisteredAgent | undefined {
  const lower = token.toLowerCase();
  return AGENT_REGISTRY.find((a) => a.token.toLowerCase() === lower);
}
