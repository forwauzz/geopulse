/**
 * Real production scan data (immersivelabs.com, scan d865b21d, score 68/D+),
 * pulled verbatim from the `scans` table. Used by the dev preview route and by
 * component tests so the redesign is exercised against true `runFreeScan()` output.
 */
import type { ScoreReportData } from './score-report';

export const immersiveLabsScan: ScoreReportData = {
  domain: 'immersivelabs.com',
  url: 'https://www.immersivelabs.com/',
  score: 68,
  letterGrade: 'D+',
  checkedAt: '2026-06-11T19:51:41Z',
  categoryScores: [
    { category: 'ai_readiness', score: 79, letterGrade: 'C+', checkCount: 8 },
    { category: 'extractability', score: 70, letterGrade: 'C-', checkCount: 11 },
    { category: 'trust', score: 25, letterGrade: 'F', checkCount: 3 },
    { category: 'demand_coverage', score: -1, letterGrade: 'N/A', checkCount: 0 },
    { category: 'conversion_readiness', score: -1, letterGrade: 'N/A', checkCount: 0 },
  ],
  issues: [
    { check: 'AI crawler access (robots.txt)', checkId: 'ai-crawler-access', passed: true, status: 'PASS', weight: 10, category: 'ai_readiness', finding: 'robots.txt does not block any known AI crawler user-agents.' },
    { check: 'HTTPS URL', checkId: 'https-only', passed: true, status: 'PASS', weight: 4, category: 'ai_readiness', finding: 'Page is loaded over HTTPS.' },
    { check: 'Title tag', checkId: 'title-tag', passed: true, status: 'PASS', weight: 4, category: 'extractability', finding: 'Title length looks reasonable (69 characters).', fix: 'Add a concise, unique title that describes the page.' },
    { check: 'Meta description', checkId: 'meta-description', passed: true, status: 'PASS', weight: 4, category: 'extractability', finding: 'Meta description present (164 characters).', fix: 'Add a meta description that summarizes the page in one or two sentences.' },
    { check: 'Canonical URL', checkId: 'canonical', passed: true, status: 'PASS', weight: 4, category: 'ai_readiness', finding: 'Canonical link is declared.', fix: 'Add a canonical URL that matches your preferred URL for this content.' },
    { check: 'Robots meta (AI visibility)', checkId: 'robots-meta', passed: true, status: 'PASS', weight: 7, category: 'ai_readiness', finding: 'Meta robots does not appear to block indexing entirely.', fix: 'Review robots meta — avoid noindex on pages you want discoverable in AI-assisted search.' },
    { check: 'Snippet eligibility', checkId: 'snippet-eligibility', passed: true, status: 'PASS', weight: 6, category: 'extractability', finding: 'No snippet restrictions detected — AI models can extract and display content excerpts.' },
    { check: 'Open Graph basics', checkId: 'open-graph', passed: true, status: 'PASS', weight: 4, category: 'extractability', finding: 'og:title and og:description are present.', fix: 'Add og:title and og:description for richer link previews.' },
    { check: 'Structured data (JSON-LD)', checkId: 'json-ld', passed: true, status: 'PASS', weight: 8, category: 'extractability', finding: 'Found 1 JSON-LD script block(s).', fix: 'Add schema.org JSON-LD (Organization, WebSite, Article, etc.) where appropriate.' },
    { check: 'Schema.org type coverage', checkId: 'schema-types', passed: false, status: 'FAIL', weight: 4, category: 'extractability', finding: 'No Schema.org @type values found in JSON-LD.', fix: 'Add JSON-LD with descriptive @type (e.g. Organization, Article, FAQPage) so AI models understand your content type.' },
    { check: 'Heading structure', checkId: 'heading-structure', passed: true, status: 'PASS', weight: 5, category: 'extractability', finding: 'Exactly one H1 — good baseline for structure.', fix: 'Use one clear H1 and organize supporting content with H2/H3.' },
    { check: 'Mobile viewport', checkId: 'viewport', passed: true, status: 'PASS', weight: 2, category: 'ai_readiness', finding: 'Viewport meta tag is present.', fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' },
    { check: 'HTML payload size', checkId: 'html-size', passed: true, status: 'PASS', weight: 3, category: 'ai_readiness', finding: 'HTML size within sampled bound (357826 characters in sample).', fix: 'Reduce HTML bloat, defer non-critical scripts, and simplify templates.' },
    { check: 'Internal linking', checkId: 'internal-links', passed: true, status: 'PASS', weight: 6, category: 'extractability', finding: '154 internal links detected in sample.', fix: 'Link related pages so crawlers and models can discover your site structure.' },
    { check: 'Image alt text coverage', checkId: 'alt-text', passed: false, status: 'FAIL', weight: 3, category: 'extractability', finding: '60 of 83 images are missing alt text (28% coverage).', fix: 'Add descriptive alt attributes to all meaningful images so AI models and screen readers can interpret them.' },
    { check: 'External authority links', checkId: 'external-links', passed: true, status: 'PASS', weight: 3, category: 'trust', finding: '23 external link(s) detected — references to external sources strengthen credibility for AI models.' },
    { check: 'Content freshness signals', checkId: 'freshness', passed: false, status: 'FAIL', weight: 3, category: 'trust', finding: 'No publication or modification date detected — AI models may deprioritize content with unknown freshness.', fix: 'Add article:published_time / article:modified_time meta tags or datePublished / dateModified in JSON-LD.' },
    { check: 'Security response headers', checkId: 'security-headers', passed: false, status: 'FAIL', weight: 2, category: 'ai_readiness', finding: 'Missing security headers: strict-transport-security, x-content-type-options, x-frame-options. Present: none.', fix: "Add the missing security headers (strict-transport-security, x-content-type-options, x-frame-options) to strengthen your site's trust profile." },
    { check: 'llms.txt presence', checkId: 'llms-txt', passed: false, status: 'FAIL', weight: 6, category: 'ai_readiness', finding: 'No /llms.txt file found at the root of your domain.', fix: 'Create and publish an /llms.txt file that describes your site, key content areas, and preferred citation format for AI models.' },
    { check: 'E-E-A-T signals (authorship & trust)', checkId: 'eeat-signals', passed: false, status: 'FAIL', weight: 6, category: 'trust', finding: 'Missing link to an About page — AI models weigh source credibility when selecting content to cite.', fix: 'Add author markup (meta name="author", schema.org Person, or a visible byline) and ensure your site links to an About page that establishes expertise and authority.' },
    { check: 'Q&A / instructional structure (LLM)', checkId: 'llm-qa-pattern', passed: false, status: 'LOW_CONFIDENCE', weight: 10, category: 'extractability', finding: 'http_403', fix: 'Add clear questions and answers or step-by-step guidance where appropriate.', confidence: 'low' },
    { check: 'Content extractability (LLM)', checkId: 'llm-extractability', passed: false, status: 'LOW_CONFIDENCE', weight: 7, category: 'extractability', finding: 'http_403', fix: 'Add concrete facts, definitions, and scannable lists that stand alone without layout.', confidence: 'low' },
  ],
};
