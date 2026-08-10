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

export interface CadenceIssue {
  checkId?: string | null;
  status?: string | null;
  passed?: boolean | null;
}

const ACCESS_BLOCKING_CHECK_IDS = new Set([
  'ai-crawler-access',
  'robots-meta',
  'snippet-eligibility',
  'https-only',
]);

function hasAccessFailure(issues: readonly CadenceIssue[]): boolean {
  return issues.some((issue) => {
    const status = (issue.status ?? (issue.passed === false ? 'FAIL' : '')).toUpperCase();
    return status === 'FAIL' && ACCESS_BLOCKING_CHECK_IDS.has(issue.checkId ?? '');
  });
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0] ?? '';
}

export function buildCadencePlan(
  generatedAtIso: string,
  issues: readonly CadenceIssue[] = [],
): CadencePhase[] {
  const base = generatedAtIso || new Date().toISOString();
  const accessBlocked = hasAccessFailure(issues);
  return [
    {
      offsetDays: 0,
      date: addDays(base, 0),
      title: accessBlocked ? 'Now — unblock access and validate' : 'Now — fix the highest-priority findings',
      actions: accessBlocked
        ? [
            'Apply only the access fixes identified in this report.',
            'Confirm real index status in Google Search Console and Bing Webmaster Tools.',
          ]
        : [
            'Assign the highest-priority fixes above to the named owners.',
            'Keep this report as the baseline for the next verification scan.',
          ],
    },
    {
      offsetDays: 14,
      date: addDays(base, 14),
      title: accessBlocked ? 'Day 14 — re-scan and confirm retrieval' : 'Day 14 — verify the first fixes',
      actions: accessBlocked
        ? [
            'Re-run this scan and confirm the affected retrieval checks now pass.',
            'Check Search Console and Bing Webmaster Tools again for the affected pages.',
          ]
        : [
            'Re-run the scan and verify the completed checks against this baseline.',
            'Keep unresolved findings assigned; do not mark them fixed without fresh evidence.',
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
