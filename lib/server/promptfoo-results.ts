export type PromptfooFramework = 'promptfoo_report' | 'promptfoo_retrieval';

type PromptfooResultRow = {
  success?: boolean;
  score?: number;
  latencyMs?: number;
  testCase?: {
    description?: string;
  };
  gradingResult?: {
    componentResults?: Array<{
      pass?: boolean;
    }>;
  };
  response?: {
    output?: string;
  };
};

export type PromptfooSummary = {
  readonly overallScore: number;
  readonly metrics: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
};

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function roundMetric(value: number): number {
  return Number(value.toFixed(2));
}

export function normalizeEvalDomain(
  siteUrl: string | null | undefined,
  fallbackDomain?: string | null | undefined
): string | null {
  const fallback = fallbackDomain?.trim().toLowerCase();
  if (fallback) return fallback;
  const raw = siteUrl?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, '').split('/')[0]?.toLowerCase() ?? null;
  }
}

export function summarizePromptfooResults(
  framework: PromptfooFramework,
  doc: Record<string, any>
): PromptfooSummary {
  const resultsRoot = (doc['results'] ?? {}) as Record<string, any>;
  const resultRows = Array.isArray(resultsRoot['results'])
    ? (resultsRoot['results'] as PromptfooResultRow[])
    : [];
  const stats = (resultsRoot['stats'] ?? {}) as Record<string, any>;
  const prompts = Array.isArray(resultsRoot['prompts']) ? resultsRoot['prompts'] : [];
  const metadataRoot = (doc['metadata'] ?? {}) as Record<string, any>;
  const config = (doc['config'] ?? {}) as Record<string, any>;

  const totalTests = resultRows.length;
  const passedTests = Number(stats['successes'] ?? resultRows.filter((row) => row.success).length);
  const failedTests = Number(stats['failures'] ?? resultRows.filter((row) => row.success === false).length);
  const errorTests = Number(stats['errors'] ?? 0);
  const assertionsPassed = resultRows.reduce((sum, row) => {
    const componentResults = row.gradingResult?.componentResults ?? [];
    return sum + componentResults.filter((result) => result.pass).length;
  }, 0);
  const assertionsFailed = resultRows.reduce((sum, row) => {
    const componentResults = row.gradingResult?.componentResults ?? [];
    return sum + componentResults.filter((result) => !result.pass).length;
  }, 0);
  const overallScore = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

  const testDetails = resultRows.map((row) => ({
    description: row.testCase?.description ?? 'Unnamed test',
    success: row.success === true,
    score: row.score ?? null,
    latency_ms: row.latencyMs ?? null,
  }));

  const baseMetrics: Record<string, unknown> = {
    total_tests: totalTests,
    passed_tests: passedTests,
    failed_tests: failedTests,
    errored_tests: errorTests,
    assertions_passed: assertionsPassed,
    assertions_failed: assertionsFailed,
    duration_ms: Number(stats['durationMs'] ?? stats['evaluationDurationMs'] ?? 0),
    provider_count: prompts.length,
    pass_rate: totalTests > 0 ? roundMetric(passedTests / totalTests) : 0,
  };

  const metadata: Record<string, unknown> = {
    eval_id: doc['evalId'] ?? null,
    suite_description: config['description'] ?? null,
    promptfoo_version: metadataRoot['promptfooVersion'] ?? null,
    exported_at: metadataRoot['exportedAt'] ?? null,
    prompt_labels: prompts.map((prompt: Record<string, unknown>) => prompt['label'] ?? prompt['raw'] ?? null),
    tests: testDetails,
  };

  if (framework === 'promptfoo_retrieval') {
    const parsedOutputs = resultRows
      .map((row) => safeJsonParse<Record<string, unknown>>(row.response?.output ?? ''))
      .filter((row): row is Record<string, unknown> => row !== null);

    const retrievedExpectedPageCount = parsedOutputs.filter(
      (row) => row['retrievedExpectedPage'] === true
    ).length;
    const mentionsExpectedFactCount = parsedOutputs.filter(
      (row) => row['answerMentionsExpectedFact'] === true
    ).length;
    const totalUnsupportedClaims = parsedOutputs.reduce((sum, row) => {
      const value = Number(row['unsupportedClaimCount'] ?? 0);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    const totalCitations = parsedOutputs.reduce((sum, row) => {
      const value = Number(row['citationCount'] ?? 0);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    baseMetrics['retrieved_expected_page_rate'] =
      parsedOutputs.length > 0 ? roundMetric(retrievedExpectedPageCount / parsedOutputs.length) : 0;
    baseMetrics['mentions_expected_fact_rate'] =
      parsedOutputs.length > 0 ? roundMetric(mentionsExpectedFactCount / parsedOutputs.length) : 0;
    baseMetrics['avg_citation_count'] =
      parsedOutputs.length > 0 ? roundMetric(totalCitations / parsedOutputs.length) : 0;
    baseMetrics['unsupported_claim_total'] = totalUnsupportedClaims;

    metadata['answers'] = parsedOutputs;
  }

  return {
    overallScore,
    metrics: baseMetrics,
    metadata,
  };
}
