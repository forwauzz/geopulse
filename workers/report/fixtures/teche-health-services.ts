import { buildDeepAuditReportPayload } from '../deep-audit-report-payload';

/**
 * Deterministic regression fixture shaped like the founder-reviewed Teché report.
 * The recipient is synthetic; no live scan or personal data is required for QA.
 */
export function buildTecheHealthServicesFixture() {
  const canonicalPass = {
    checkId: 'ai-crawler-access',
    check: 'AI retrieval agent access (robots.txt)',
    passed: true,
    status: 'PASS',
    weight: 12,
    category: 'ai_readiness',
    finding: 'The tested retrieval agents were allowed by robots.txt.',
  } as const;
  const canonicalGap = {
    checkId: 'canonical',
    check: 'Canonical URL declaration',
    passed: false,
    status: 'FAIL',
    weight: 5,
    category: 'ai_readiness',
    finding: 'No canonical link was detected on the tested page.',
    fix: 'Add a self-referencing canonical URL to each indexable page.',
  } as const;
  const answerGap = {
    checkId: 'llm-qa-pattern',
    check: 'Direct question-answer structure',
    passed: false,
    status: 'FAIL',
    weight: 6,
    category: 'extractability',
    finding: 'The tested pages do not consistently answer buyer questions directly.',
    fix: 'Add concise question-led sections to priority service pages.',
  } as const;
  const allIssues = [
    canonicalPass,
    canonicalGap,
    answerGap,
    {
      checkId: 'json-ld',
      check: 'Structured data (JSON-LD) validity',
      passed: false,
      status: 'WARNING',
      weight: 4,
      category: 'trust',
      finding: 'Structured data coverage is incomplete on tested service pages.',
      fix: 'Add valid Organization and Service schema where supported by page content.',
    },
    {
      checkId: 'title-tag',
      check: 'Page title',
      passed: true,
      status: 'PASS',
      weight: 3,
      category: 'extractability',
      finding: 'A descriptive page title was found.',
    },
  ];

  return buildDeepAuditReportPayload({
    scanId: 'qa-teche-scan',
    runId: 'qa-teche-run',
    domain: 'techehealthservices.com',
    seedUrl: 'https://techehealthservices.com/',
    aggregateScore: 74,
    aggregateLetterGrade: 'C',
    generatedAt: '2026-08-09T12:00:00.000Z',
    coverageSummary: {
      seed_url: 'https://techehealthservices.com/',
      urls_planned: 4,
      pages_fetched: 4,
      pages_errored: 0,
      robots_status: 200,
    },
    highlightedIssues: [canonicalGap, answerGap],
    allIssues,
    categoryScores: [
      // Legacy reports sometimes persisted total weights in this field. It must
      // never be presented as a number of checks.
      { category: 'ai_readiness', score: 72, letterGrade: 'C-', checkCount: 102 },
      { category: 'extractability', score: 68, letterGrade: 'D+', checkCount: 2 },
      { category: 'trust', score: 63, letterGrade: 'D', checkCount: 1 },
    ],
    technicalAppendix: {
      robotsSummary: 'AI retrieval agent access [PASS]: tested retrieval agents were allowed.',
      schemaSummary: 'Structured data coverage [WARNING]: incomplete on tested service pages.',
    },
    pages: [
      {
        url: 'https://techehealthservices.com/',
        score: 76,
        letter_grade: 'C+',
        section: 'home',
        issues_json: [canonicalPass, canonicalGap],
      },
      {
        url: 'https://techehealthservices.com/practice-areas/it-services/',
        score: 72,
        letter_grade: 'C-',
        section: 'services',
        issues_json: [canonicalPass, answerGap],
      },
      {
        url: 'https://techehealthservices.com/practice-areas/ehr-implementation/',
        score: 73,
        letter_grade: 'C',
        section: 'services',
        issues_json: [canonicalPass, answerGap],
      },
      {
        url: 'https://techehealthservices.com/about/',
        score: 75,
        letter_grade: 'C+',
        section: 'about',
        issues_json: [canonicalPass],
      },
    ],
  });
}
