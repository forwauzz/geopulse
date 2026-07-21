/**
 * Remediation catalog (spec C9) — per-check delegation metadata for the two-layer report.
 *
 * Owner labels are OPERATIONAL ROLES a small-business owner can actually assign work to.
 * "Engineering" is banned by the spec: the reader is an MSP owner with a WordPress site,
 * a hosting provider, and maybe a marketing assistant — not an engineering team.
 */

export type OwnerRole =
  | 'You'
  | 'WordPress admin'
  | 'Hosting/Cloudflare admin'
  | 'Marketing/content person'
  | 'Google Business Profile manager';

export type EffortImpact = 'Quick Win' | 'Big Project' | 'Fill-in' | 'Skip';

export interface RemediationEntry {
  checkId: string;
  ownerRole: OwnerRole;
  /** Human effort estimate, e.g. "10-15 minutes". */
  effort: string;
  /** True = a non-engineer can do it themselves; false = worth hiring/delegating out. */
  diy: boolean;
  /** The tool where the fix happens. */
  tool: string;
  /** Click path inside that tool. */
  clickPath: string;
  /** What "fixed" looks like. */
  desiredState: string;
  /** Paste-ready instruction the owner can forward verbatim to whoever does the work. */
  copyPaste: string;
  /** How to confirm the fix worked. */
  verify: string;
  /** Risk / rollback note. */
  rollback: string;
  effortImpact: EffortImpact;
}

export const REMEDIATION_CATALOG: readonly RemediationEntry[] = [
  {
    checkId: 'ai-crawler-access',
    ownerRole: 'Hosting/Cloudflare admin',
    effort: '15-30 minutes',
    diy: true,
    tool: 'Your robots.txt file (WordPress: Yoast/Rank Math → Tools → File editor, or hosting file manager)',
    clickPath: 'WordPress admin → SEO plugin → Tools → robots.txt editor',
    desiredState: 'OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot and Bingbot are all allowed to crawl the site.',
    copyPaste:
      'Please update our robots.txt so the AI search bots can reach the site. Remove any "Disallow: /" rules under User-agent lines for OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot, Bingbot, and under "User-agent: *". Blocking GPTBot or Google-Extended is fine to keep if we chose to — those only affect AI training, not search visibility.',
    verify: 'Visit yourdomain.com/robots.txt in a browser and confirm no Disallow: / applies to those bots, then re-run the GEO-Pulse scan.',
    rollback: 'robots.txt edits take effect immediately and are trivially reversible — keep a copy of the old file.',
    effortImpact: 'Quick Win',
  },
  {
    checkId: 'robots-meta',
    ownerRole: 'WordPress admin',
    effort: '10 minutes',
    diy: true,
    tool: 'WordPress page editor (Yoast/Rank Math advanced settings)',
    clickPath: 'Edit page → SEO plugin box → Advanced → "Allow search engines to show this page?"',
    desiredState: 'No noindex directive on pages you want found.',
    copyPaste:
      'Our page has a "noindex" tag that hides it from Google and AI search. In the WordPress editor, open the SEO plugin\'s Advanced settings for the page and set "Allow search engines to show this page" to Yes, then re-save.',
    verify: 'View page source and confirm no <meta name="robots" content="noindex"> remains; use Google Search Console URL Inspection to re-request indexing.',
    rollback: 'Reversible in the same setting. No risk beyond the page becoming visible again.',
    effortImpact: 'Quick Win',
  },
  {
    checkId: 'snippet-eligibility',
    ownerRole: 'WordPress admin',
    effort: '10 minutes',
    diy: true,
    tool: 'WordPress SEO plugin / theme header settings',
    clickPath: 'Edit page → SEO plugin box → Advanced → Meta robots advanced',
    desiredState: 'No nosnippet or max-snippet:0 restriction on pages you want quoted in AI answers.',
    copyPaste:
      'Please remove the "nosnippet" (or max-snippet:0) robots directive from our pages — it stops Google from quoting us, including in AI Overviews.',
    verify: 'View page source: the robots meta tag should not contain nosnippet or max-snippet:0.',
    rollback: 'Fully reversible; snippet settings only control how much text Google may quote.',
    effortImpact: 'Quick Win',
  },
  {
    checkId: 'https-only',
    ownerRole: 'Hosting/Cloudflare admin',
    effort: '30-60 minutes',
    diy: false,
    tool: 'Hosting control panel / Cloudflare SSL settings',
    clickPath: 'Cloudflare dashboard → SSL/TLS → set mode to Full (strict); hosting panel → force HTTPS redirect',
    desiredState: 'Every page loads over https:// and http:// redirects to it.',
    copyPaste:
      'Please enable HTTPS site-wide: install/renew the SSL certificate, force-redirect all http:// URLs to https://, and update the WordPress Site URL to the https version.',
    verify: 'Open the site with http:// — it should redirect to https:// with a padlock and no mixed-content warnings.',
    rollback: 'Handled by your host; low risk. Keep the http→https redirect permanent (301).',
    effortImpact: 'Big Project',
  },
  {
    checkId: 'canonical',
    ownerRole: 'WordPress admin',
    effort: '10-20 minutes',
    diy: true,
    tool: 'WordPress SEO plugin',
    clickPath: 'Edit page → SEO plugin box → Advanced → Canonical URL',
    desiredState: 'Each page\'s canonical URL points to itself (or the one true version of the page).',
    copyPaste:
      'Our page\'s canonical tag points at the wrong URL, which hands our search credit to a different page. In the SEO plugin\'s Advanced settings, clear the Canonical URL field (it then defaults to the page itself) or set it to the correct https:// URL.',
    verify: 'View page source: <link rel="canonical"> should match the page\'s own URL.',
    rollback: 'Reversible per page; no side effects when set to the page itself.',
    effortImpact: 'Quick Win',
  },
  {
    checkId: 'json-ld',
    ownerRole: 'WordPress admin',
    effort: '30-60 minutes',
    diy: true,
    tool: 'WordPress SEO plugin (Yoast/Rank Math schema settings) or a schema plugin',
    clickPath: 'SEO plugin → Search Appearance / Schema → set Organization or LocalBusiness with name, logo, address',
    desiredState: 'Valid JSON-LD (LocalBusiness or Organization with name + address) whose values match what the page visibly says.',
    copyPaste:
      'Please add structured data to our site: LocalBusiness schema with our exact business name, address, and phone (matching the site footer), plus FAQPage schema on pages that answer common questions. Yoast or Rank Math can do this without code.',
    verify: 'Paste the page URL into validator.schema.org (or Google\'s Rich Results Test) — it should show LocalBusiness/Organization with no errors.',
    rollback: 'Schema is additive markup; removing the plugin setting restores the previous state.',
    effortImpact: 'Quick Win',
  },
  {
    checkId: 'schema-types',
    ownerRole: 'WordPress admin',
    effort: '30-60 minutes',
    diy: true,
    tool: 'WordPress SEO/schema plugin',
    clickPath: 'SEO plugin → Schema settings → choose the specific type per page (Service, FAQPage, Article)',
    desiredState: 'Pages carry the specific schema type that matches their content, not just a generic WebPage.',
    copyPaste:
      'Please set specific schema types per page: LocalBusiness on the homepage/contact, Service on service pages, FAQPage on FAQ content, Article/BlogPosting on blog posts.',
    verify: 'validator.schema.org shows the specific @type on each page.',
    rollback: 'Additive and reversible via the same plugin settings.',
    effortImpact: 'Fill-in',
  },
  {
    checkId: 'title-tag',
    ownerRole: 'Marketing/content person',
    effort: '5-10 minutes per page',
    diy: true,
    tool: 'WordPress SEO plugin',
    clickPath: 'Edit page → SEO plugin box → SEO title',
    desiredState: 'A 10-70 character title that says what the page is and who it serves.',
    copyPaste:
      'Please give each key page a clear SEO title in the pattern: "Service — Company Name | City". Keep it under 70 characters.',
    verify: 'Google the page (site:yourdomain.com) and check the title shown; re-run the scan.',
    rollback: 'Titles are freely editable; no risk.',
    effortImpact: 'Quick Win',
  },
  {
    checkId: 'heading-structure',
    ownerRole: 'Marketing/content person',
    effort: '15-30 minutes per page',
    diy: true,
    tool: 'WordPress page editor',
    clickPath: 'Edit page → select the main headline → set to Heading 1; supporting sections → Heading 2',
    desiredState: 'One H1 stating the page\'s core promise, with H2s that read like the questions customers ask.',
    copyPaste:
      'Please restructure the page headings: exactly one Heading 1 at the top, and turn each section title into a Heading 2 phrased the way a customer would ask it (e.g. "How much does managed IT cost?").',
    verify: 'In the editor, confirm one H1; re-run the scan.',
    rollback: 'Pure formatting; reversible.',
    effortImpact: 'Fill-in',
  },
  {
    checkId: 'html-size',
    ownerRole: 'Hosting/Cloudflare admin',
    effort: '1-3 hours',
    diy: false,
    tool: 'WordPress plugins / theme / caching plugin',
    clickPath: 'Review page builder bloat; enable a caching/optimization plugin (WP Rocket, LiteSpeed)',
    desiredState: 'The page\'s HTML delivers its actual text content without megabytes of builder markup or script-only rendering.',
    copyPaste:
      'Our pages are heavy enough that AI crawlers may truncate them. Please reduce page weight: enable caching/minification, and make sure core service text is server-rendered HTML, not injected by JavaScript.',
    verify: 'Re-run the scan; page size check should pass.',
    rollback: 'Optimization plugins can be disabled if anything breaks — test on one page first.',
    effortImpact: 'Big Project',
  },
  {
    checkId: 'internal-links',
    ownerRole: 'Marketing/content person',
    effort: '20-30 minutes',
    diy: true,
    tool: 'WordPress page editor',
    clickPath: 'Edit page → link key phrases to your service/contact pages',
    desiredState: 'Every page links to your money pages (services, contact) and related content.',
    copyPaste:
      'Please add 3-5 internal links from this page to our main service pages and contact page, using descriptive link text (e.g. "managed IT support in Montreal", not "click here").',
    verify: 'Re-run the scan; internal-links check should pass.',
    rollback: 'Links are freely editable.',
    effortImpact: 'Fill-in',
  },
  {
    checkId: 'alt-text',
    ownerRole: 'Marketing/content person',
    effort: '15-30 minutes',
    diy: true,
    tool: 'WordPress media library',
    clickPath: 'Media library → select image → Alt Text field',
    desiredState: 'Every meaningful image has alt text describing what it shows.',
    copyPaste: 'Please add alt text to the images on our key pages — one plain sentence describing each image.',
    verify: 'Re-run the scan; alt-text check should pass.',
    rollback: 'No risk.',
    effortImpact: 'Fill-in',
  },
  {
    checkId: 'external-links',
    ownerRole: 'Marketing/content person',
    effort: '15 minutes per page',
    diy: true,
    tool: 'WordPress page editor',
    clickPath: 'Edit page → add citations to authoritative sources',
    desiredState: 'Editorial content cites real sources (vendors, standards bodies, statistics).',
    copyPaste: 'When our articles state facts or statistics, please link the claim to its original source.',
    verify: 'Re-run the scan.',
    rollback: 'No risk.',
    effortImpact: 'Fill-in',
  },
  {
    checkId: 'freshness',
    ownerRole: 'Marketing/content person',
    effort: '1-2 hours per quarter',
    diy: true,
    tool: 'WordPress editor',
    clickPath: 'Edit the page → make a real content update → republish',
    desiredState: 'Pricing, security, and compliance pages show recent, genuine updates. Evergreen pages are fine as they are.',
    copyPaste:
      'Please review our pricing/security/compliance pages quarterly and make genuine updates (current prices, new certifications, this year\'s threats). Do NOT just bump the date — engines detect that.',
    verify: 'The page shows an updated date AND visibly updated content.',
    rollback: 'Content edits are versioned in WordPress; restore any revision.',
    effortImpact: 'Fill-in',
  },
  {
    checkId: 'eeat-signals',
    ownerRole: 'You',
    effort: '2-4 hours once',
    diy: true,
    tool: 'WordPress pages',
    clickPath: 'Create/expand an About, Team, or Why Us page; link it from the main menu and footer',
    desiredState: 'Every page links to an identity page naming the business, its people, credentials, and proof (years, certifications, partners).',
    copyPaste:
      'Please make sure our About/Team/Why Us page names who we are, shows real people with roles, and lists credentials (certifications, partnerships, years in business) — then link it from the site footer so every page reaches it.',
    verify: 'Every page\'s footer/menu links to the identity page; re-run the scan.',
    rollback: 'No risk.',
    effortImpact: 'Quick Win',
  },
  {
    checkId: 'llm-qa-pattern',
    ownerRole: 'Marketing/content person',
    effort: '2-4 hours per page',
    diy: true,
    tool: 'WordPress editor',
    clickPath: 'Edit page → restructure so the direct answer appears in the first third',
    desiredState: 'Key pages answer the customer\'s question in the first 30% of the page (answer-first, then detail).',
    copyPaste:
      'Please restructure our key pages answer-first: open with a 2-3 sentence direct answer to what the visitor came for (what we do, for whom, at what price range), then the detail below. Nearly half of AI citations come from the top third of a page.',
    verify: 'Read the first screen of the page — does it answer the core question without scrolling? Re-run the scan.',
    rollback: 'WordPress revisions let you restore the old layout.',
    effortImpact: 'Big Project',
  },
  {
    checkId: 'llm-extractability',
    ownerRole: 'Marketing/content person',
    effort: '1-2 hours per page',
    diy: true,
    tool: 'WordPress editor',
    clickPath: 'Edit page → replace vague copy with concrete facts (services, areas served, response times, contact)',
    desiredState: 'A machine reading the page can extract: what you do, where, for whom, and how to reach you.',
    copyPaste:
      'Please make our pages concretely extractable: name the exact services, cities served, response times, and contact details in plain text (not only in images or sliders).',
    verify: 'Re-run the scan; extractability check should pass.',
    rollback: 'Content edits are versioned.',
    effortImpact: 'Big Project',
  },
  {
    checkId: 'information-gain',
    ownerRole: 'Marketing/content person',
    effort: '1-2 hours per page',
    diy: true,
    tool: 'WordPress editor',
    clickPath: 'Edit page -> replace stock phrases with facts only you can claim',
    desiredState: 'Copy that carries original specifics — real numbers, prices, response times, certifications, named case studies — instead of templated agency phrases.',
    copyPaste:
      'Please rewrite the generic phrases on our key pages ("best-in-class", "tailored solutions") into concrete facts: our actual response time, client count, certifications, prices, and one real case study per service.',
    verify: 'Re-run the scan; the information-gain check should pass.',
    rollback: 'Content edits are versioned in WordPress.',
    effortImpact: 'Fill-in',
  },
  {
    checkId: 'hreflang-parity',
    ownerRole: 'WordPress admin',
    effort: '30-60 minutes',
    diy: true,
    tool: 'WPML / Polylang (WordPress multilingual plugin)',
    clickPath: 'Plugin settings -> Languages -> enable hreflang output; link each page to its translation',
    desiredState: 'Every language version lists all alternates including itself, plus an x-default.',
    copyPaste:
      'Our hreflang annotations are inconsistent. Please make each language version list every alternate INCLUDING itself, add an x-default, and keep the set identical across all versions. WPML/Polylang handle this once pages are linked to their translations.',
    verify: 'View source on both language versions: identical hreflang sets, each including itself.',
    rollback: 'Annotations are additive metadata; removing them restores the previous state.',
    effortImpact: 'Fill-in',
  },
  // ── Hygiene (worth doing; does not move the AI score) ───────────────────────
  {
    checkId: 'meta-description',
    ownerRole: 'Marketing/content person',
    effort: '5 minutes per page',
    diy: true,
    tool: 'WordPress SEO plugin',
    clickPath: 'Edit page → SEO plugin box → Meta description',
    desiredState: 'A 50-170 character summary per key page.',
    copyPaste: 'Please write a one-to-two sentence meta description for each key page summarizing what it offers.',
    verify: 'Re-run the scan.',
    rollback: 'No risk.',
    effortImpact: 'Fill-in',
  },
  {
    checkId: 'open-graph',
    ownerRole: 'Marketing/content person',
    effort: '10 minutes',
    diy: true,
    tool: 'WordPress SEO plugin',
    clickPath: 'Edit page → SEO plugin box → Social tab → set title/description/image',
    desiredState: 'og:title and og:description present so shared links preview correctly.',
    copyPaste: 'Please set the Social (Open Graph) title, description, and image for our key pages in the SEO plugin.',
    verify: 'Paste the URL into a social post composer and check the preview.',
    rollback: 'No risk.',
    effortImpact: 'Fill-in',
  },
  {
    checkId: 'viewport',
    ownerRole: 'WordPress admin',
    effort: '15 minutes',
    diy: false,
    tool: 'WordPress theme',
    clickPath: 'Theme header — nearly all modern themes include the viewport tag; a missing one suggests a very old theme',
    desiredState: 'The mobile viewport meta tag is present.',
    copyPaste: 'Our site is missing the mobile viewport tag — please add <meta name="viewport" content="width=device-width, initial-scale=1"> to the theme header (or update the theme).',
    verify: 'View page source for the viewport meta tag.',
    rollback: 'Trivial to remove; no risk.',
    effortImpact: 'Fill-in',
  },
  {
    checkId: 'security-headers',
    ownerRole: 'Hosting/Cloudflare admin',
    effort: '20-30 minutes',
    diy: true,
    tool: 'Cloudflare dashboard',
    clickPath: 'Cloudflare → Rules → Transform Rules → Modify Response Header (add HSTS via SSL/TLS → Edge Certificates)',
    desiredState: 'Strict-Transport-Security, X-Content-Type-Options, and X-Frame-Options headers present. Good practice — not an AI-visibility lever.',
    copyPaste:
      'Please add these response headers at the CDN: Strict-Transport-Security: max-age=31536000; X-Content-Type-Options: nosniff; X-Frame-Options: SAMEORIGIN. In Cloudflare this is Rules → Transform Rules → Modify Response Header.',
    verify: 'Check securityheaders.com for your domain.',
    rollback: 'Remove the transform rule; headers revert immediately. Test HSTS carefully — it is sticky in browsers for its max-age.',
    effortImpact: 'Fill-in',
  },
  {
    checkId: 'llms-txt',
    ownerRole: 'You',
    effort: '15 minutes (optional)',
    diy: true,
    tool: 'Hosting file manager',
    clickPath: 'Upload an llms.txt file to the site root — entirely optional',
    desiredState: 'Optional. No engine honors llms.txt today; publish one only as an experiment.',
    copyPaste: 'Optional experiment: publish an /llms.txt file describing the business. No measurable benefit is promised — skip this unless curious.',
    verify: 'yourdomain.com/llms.txt loads.',
    rollback: 'Delete the file.',
    effortImpact: 'Skip',
  },
];

const byId = new Map(REMEDIATION_CATALOG.map((e) => [e.checkId, e]));

export function remediationFor(checkId: string): RemediationEntry | undefined {
  return byId.get(checkId);
}

/** Operational owner label for a check — never "Engineering" (spec C9). */
export function ownerRoleFor(checkId: string): OwnerRole {
  return byId.get(checkId)?.ownerRole ?? 'You';
}
