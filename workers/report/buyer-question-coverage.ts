/**
 * Buyer-question coverage (spec C13, transparent-sample variant).
 *
 * The full C13 vision — live "which domains get cited per engine" sampling — runs in
 * the existing benchmark engine. What every report can do deterministically is show
 * WHERE the crawled site fails to cover the four buyer-question categories at all:
 * service, location, comparison, and proof coverage. No fabricated citation counts;
 * gaps we can actually see, and a pointer to the live benchmark for the rest.
 */

export interface CoverageGap {
  category: 'service' | 'location' | 'comparison' | 'proof';
  covered: boolean;
  evidence: string;
  action: string;
}

export interface BuyerQuestionCoverage {
  gaps: CoverageGap[];
  note: string;
}

export function assessBuyerQuestionCoverage(pages: readonly { url: string; textSample?: string }[]): BuyerQuestionCoverage {
  const urls = pages.map((p) => p.url.toLowerCase());
  const text = pages.map((p) => p.textSample ?? '').join(' ').toLowerCase();

  const serviceCovered =
    urls.some((u) => /\/(services?|solutions?|managed-|it-support|pricing|plans)/.test(u)) ||
    /\b(managed it|it support|helpdesk|cybersecurity|backup|cloud migration)\b/.test(text);

  const locationCovered =
    urls.some((u) => /\/(locations?|areas?|montreal|toronto|laval|quebec|ottawa|[a-z-]+-it-support)/.test(u)) ||
    /\b(serving|service area|based in|proudly serving)\b/.test(text);

  const comparisonCovered =
    urls.some((u) => /\/(vs-|versus|compare|comparison|best-|alternatives?)/.test(u)) ||
    /\b(vs\.?|versus|compared to|alternatives to|how to choose)\b/.test(text);

  const proofCovered =
    urls.some((u) => /\/(case-stud|testimonials?|reviews?|results|clients|portfolio)/.test(u)) ||
    /\b(case study|case studies|testimonial|our clients|reviewed us|5-star|success stor)\b/.test(text);

  const gaps: CoverageGap[] = [
    {
      category: 'service',
      covered: serviceCovered,
      evidence: serviceCovered
        ? 'Service pages or explicit service language found.'
        : 'No dedicated service pages or explicit service language detected in the crawl.',
      action: 'One page per core service, answer-first: what it is, who it is for, what it costs.',
    },
    {
      category: 'location',
      covered: locationCovered,
      evidence: locationCovered
        ? 'Location/service-area coverage found.'
        : 'No location or service-area coverage detected — engines cannot answer "near me" questions about you.',
      action: 'A service-area page per city you serve, with LocalBusiness schema naming the area.',
    },
    {
      category: 'comparison',
      covered: comparisonCovered,
      evidence: comparisonCovered
        ? 'Comparison/decision content found.'
        : 'No comparison or "how to choose" content — the single highest-cited format (~32.5% of AI citations are comparative listicles, Digital Bloom).',
      action: 'Publish honest comparison content: "X vs Y", "how to choose an MSP", "best options for …" including competitors.',
    },
    {
      category: 'proof',
      covered: proofCovered,
      evidence: proofCovered
        ? 'Proof content (case studies/testimonials/reviews) found.'
        : 'No case studies, testimonials, or named results detected — engines favor sources with verifiable proof.',
      action: 'Publish 2-3 named case studies with real numbers, and a testimonials page.',
    },
  ];

  return {
    gaps,
    note:
      'This is coverage your site controls, measured from the crawl — not live citation share. ' +
      'For a per-engine citation benchmark against named competitors, run the GEO-Pulse citation benchmark; ' +
      'it samples real buyer questions across engines with a transparent question list.',
  };
}
