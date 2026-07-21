/**
 * Real-indexation guidance (spec C5): markup and crawlability make a page ELIGIBLE;
 * only the engines' own consoles prove it is actually INDEXED. Shared between the web
 * report and the PDF so both say the same thing.
 */

export interface IndexationStep {
  destination: string;
  tool: string;
  steps: string[];
}

export const INDEXATION_GUIDANCE: {
  headline: string;
  explanation: string;
  steps: IndexationStep[];
  caveat: string;
} = {
  headline: 'Eligible is not the same as indexed',
  explanation:
    'Everything above measures whether your site is ELIGIBLE for AI search. Whether pages are ' +
    'actually IN the indexes only Google and Bing can confirm — a 10-minute check anyone in ' +
    'your team can do with a free account.',
  steps: [
    {
      destination: 'Google (Search + AI Overviews)',
      tool: 'Google Search Console (free)',
      steps: [
        'Go to search.google.com/search-console and add your site (choose Domain property; your hosting or IT person can add the DNS record it asks for).',
        'Paste your homepage URL into the URL Inspection bar at the top.',
        'Read the verdict: "URL is on Google" = indexed. "URL is not on Google" = not indexed — click "Request indexing".',
        'Repeat for your 3-5 most important service pages.',
        'While there, open Settings and confirm any "Search generative AI" control is not set to opt out.',
      ],
    },
    {
      destination: 'Bing / Copilot / ChatGPT-local',
      tool: 'Bing Webmaster Tools (free)',
      steps: [
        'Go to bing.com/webmasters and sign in — you can import your verified site straight from Google Search Console in two clicks.',
        'Use URL Inspection on the same pages.',
        'If pages are missing, submit your sitemap under Sitemaps. ChatGPT leans on the Bing index for local queries, so this directly affects AI visibility.',
      ],
    },
  ],
  caveat:
    'A quick "site:yourdomain.com" search in Google or Bing gives a rough sanity check, but the ' +
    'console verdicts above are the authoritative answer.',
};
