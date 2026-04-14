import type { SupabaseClient } from '@supabase/supabase-js';
import { structuralReportScore } from './report-eval-structural';
import { normalizeEvalDomain } from './promptfoo-results';

type SupabaseLike = SupabaseClient<any, 'public', any>;

function roundMetric(value: number): number {
  return Number(value.toFixed(2));
}

function issueStatus(issue: Record<string, unknown>): string {
  const status = issue['status'];
  if (typeof status === 'string' && status.length > 0) return status;
  if (issue['passed'] === true) return 'PASS';
  if (issue['passed'] === false) return 'FAIL';
  return 'NOT_EVALUATED';
}

export function summarizeGeneratedReportEval(args: {
  readonly markdown: string;
  readonly siteUrl: string;
  readonly reportId: string | null;
  readonly scanId: string | null;
  readonly generatorVersion?: string;
  readonly promptSetName?: string;
  readonly allIssues?: readonly Record<string, unknown>[];
  readonly reportPayloadVersion?: number | null;
  readonly metadata?: Record<string, unknown>;
}): {
  readonly framework: 'layer_one_report';
  readonly rubricVersion: 'layer-one-structural-v1';
  readonly generatorVersion: string;
  readonly overallScore: number;
  readonly domain: string | null;
  readonly siteUrl: string;
  readonly promptSetName: string;
  readonly metrics: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
} {
  const structural = structuralReportScore(args.markdown);
  const allIssues = args.allIssues ?? [];
  const totalTests = allIssues.length;
  const passedTests = allIssues.filter((issue) => issueStatus(issue) === 'PASS').length;
  const failedTests = allIssues.filter((issue) => issueStatus(issue) === 'FAIL').length;
  const warningTests = allIssues.filter((issue) => issueStatus(issue) === 'WARNING').length;
  const blockedTests = allIssues.filter((issue) => issueStatus(issue) === 'BLOCKED').length;
  const lowConfidenceTests = allIssues.filter((issue) => issueStatus(issue) === 'LOW_CONFIDENCE').length;
  const notEvaluatedTests = allIssues.filter((issue) => issueStatus(issue) === 'NOT_EVALUATED').length;

  return {
    framework: 'layer_one_report',
    rubricVersion: 'layer-one-structural-v1',
    generatorVersion: args.generatorVersion ?? 'deep-audit-markdown-v1',
    overallScore: structural.overall,
    domain: normalizeEvalDomain(args.siteUrl),
    siteUrl: args.siteUrl,
    promptSetName: args.promptSetName ?? 'layer-one-default',
    metrics: {
      ...structural.metrics,
      total_tests: totalTests,
      passed_tests: passedTests,
      failed_tests: failedTests,
      warning_tests: warningTests,
      blocked_tests: blockedTests,
      low_confidence_tests: lowConfidenceTests,
      not_evaluated_tests: notEvaluatedTests,
      pass_rate: totalTests > 0 ? roundMetric(passedTests / totalTests) : 0,
    },
    metadata: {
      report_id: args.reportId,
      scan_id: args.scanId,
      report_payload_version: args.reportPayloadVersion ?? null,
      writer: 'automatic_post_generation',
      ...(args.metadata ?? {}),
    },
  };
}

export async function writeGeneratedReportEval(
  supabase: SupabaseLike,
  args: {
    readonly markdown: string;
    readonly siteUrl: string;
    readonly reportId: string | null;
    readonly scanId: string | null;
    readonly generatorVersion?: string;
    readonly promptSetName?: string;
    readonly allIssues?: readonly Record<string, unknown>[];
    readonly reportPayloadVersion?: number | null;
    readonly metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const summary = summarizeGeneratedReportEval(args);

  const { error } = await supabase.from('report_eval_runs').insert({
    report_id: args.reportId,
    scan_id: args.scanId,
    rubric_version: summary.rubricVersion,
    generator_version: summary.generatorVersion,
    overall_score: summary.overallScore,
    framework: summary.framework,
    domain: summary.domain,
    site_url: summary.siteUrl,
    prompt_set_name: summary.promptSetName,
    metrics: summary.metrics,
    metadata: summary.metadata,
  });

  if (error) throw error;
}
