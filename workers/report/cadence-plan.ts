/**
 * Cadence / re-scan plan (spec C11): the report ends with a dated sequence, not a
 * pile of findings. Dates are computed from the report's generation date.
 */

export interface CadencePhase {
  offsetDays: number;
  date: string; // YYYY-MM-DD
  title: string;
  actions: string[];
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0] ?? '';
}

export function buildCadencePlan(generatedAtIso: string): CadencePhase[] {
  const base = generatedAtIso || new Date().toISOString();
  return [
    {
      offsetDays: 0,
      date: addDays(base, 0),
      title: 'Now — unblock access and validate',
      actions: [
        'Apply the access fixes above (robots.txt, firewall safelist, noindex/nosnippet).',
        'Confirm real index status in Google Search Console and Bing Webmaster Tools.',
      ],
    },
    {
      offsetDays: 14,
      date: addDays(base, 14),
      title: 'Day 14 — re-scan and confirm retrieval',
      actions: [
        'Re-run this scan and confirm every destination in the eligibility matrix reads Eligible.',
        'Check Search Console/Bing again — the pages you requested should now be indexed.',
      ],
    },
    {
      offsetDays: 30,
      date: addDays(base, 30),
      title: 'Day 30 — profiles, schema, and key pages',
      actions: [
        'Complete business profiles (Google Business Profile, Bing Places) and directory listings.',
        'Ship LocalBusiness/FAQPage schema and restructure your top service pages answer-first.',
      ],
    },
    {
      offsetDays: 60,
      date: addDays(base, 60),
      title: 'Day 60 — buyer-question content',
      actions: [
        'Publish pages that answer the questions buyers actually ask (pricing, comparisons, "best X in Y").',
        'Add real proof: case studies, certifications, named team members.',
      ],
    },
    {
      offsetDays: 90,
      date: addDays(base, 90),
      title: 'Day 90 — measure against this baseline',
      actions: [
        'Re-run the scan and compare with today\'s report as the baseline.',
        'Ask ChatGPT, Claude, and Perplexity your top 5 buyer questions and note whether you are cited.',
      ],
    },
  ];
}
